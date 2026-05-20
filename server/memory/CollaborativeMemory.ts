 import { GraphMemory } from './GraphMemory';
import * as crypto from 'crypto';
import { WebSocket } from 'ws';

interface UserPresence {
  userId: string;
  deviceId: string;
  sessionId: string;
  lastSeen: Date;
  currentContext?: string;
}

interface SharedSpace {
  id: string;
  name: string;
  members: string[];
  encryptionKey: string;
  createdAt: Date;
}

export class CollaborativeMemory {
  private graphMemory: GraphMemory;
  private presences: Map<string, UserPresence> = new Map();
  private spaces: Map<string, SharedSpace> = new Map();
  private wsClients: Map<string, WebSocket> = new Map();

  constructor(graphMemory: GraphMemory) {
    this.graphMemory = graphMemory;
  }

  async createSharedSpace(name: string, creatorId: string): Promise<SharedSpace> {
    const spaceId = crypto.randomUUID();
    const key = crypto.randomBytes(32).toString('hex');

    const space: SharedSpace = {
      id: spaceId,
      name,
      members: [creatorId],
      encryptionKey: key,
      createdAt: new Date()
    };

    this.spaces.set(spaceId, space);
    
    // Store in graph as encrypted node
    await this.graphMemory.storeMemory(
      `Shared space created: ${name}`,
      {
        type: 'space_creation',
        spaceId,
        creatorId,
        encryptedKey: this.encryptKeyForStorage(key)
      }
    );

    return space;
  }

  async inviteToSpace(spaceId: string, inviterId: string, inviteeId: string): Promise<void> {
    const space = this.spaces.get(spaceId);
    if (!space || !space.members.includes(inviterId)) {
      throw new Error('Unauthorized or space not found');
    }

    // Generate invitation with encrypted key
    const invitationToken = this.createSecureToken({
      spaceId,
      inviteeId,
      encryptedKey: await this.encryptForUser(space.encryptionKey, inviteeId),
      expires: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    });

    // Send to invitee via WebSocket or push notification
    this.notifyUser(inviteeId, {
      type: 'space_invitation',
      spaceName: space.name,
      token: invitationToken,
      inviter: inviterId
    });
  }

  async joinSpace(userId: string, token: string): Promise<void> {
    const payload = this.verifyToken(token);
    if (payload.inviteeId !== userId) {
      throw new Error('Invalid invitation');
    }

    const space = this.spaces.get(payload.spaceId);
    if (space) {
      space.members.push(userId);
      this.broadcastToSpace(space.id, {
        type: 'member_joined',
        userId,
        timestamp: new Date()
      });
    }
  }

  async syncMemory(userId: string, deviceId: string, memoryIds: string[]): Promise<void> {
    const sessionId = crypto.randomUUID();
    const presence: UserPresence = {
      userId,
      deviceId,
      sessionId,
      lastSeen: new Date(),
      currentContext: 'syncing'
    };
    
    this.presences.set(`${userId}:${deviceId}`, presence);

    // Get all memories the user should have access to
    const accessibleMemories = await this.getAccessibleMemories(userId);
    
    // Determine sync strategy
    const toPush = accessibleMemories.filter(m => !memoryIds.includes(m.id));
    const toPull = this.getPendingUpdates(userId);

    return {
      push: toPush,
      pull: toPull,
      sessionId
    };
  }

  async shareMemory(
    memoryId: string,
    fromUser: string,
    toUsers: string[],
    context: string
  ): Promise<void> {
    // Encrypt memory for each recipient
    const encryptedShares = await Promise.all(
      toUsers.map(async userId => {
        const userPublicKey = await this.getUserPublicKey(userId);
        return {
          userId,
          encryptedContent: this.encryptWithPublicKey(context, userPublicKey)
        };
      })
    );

    //   // Store share relationships in graph
    await Promise.all(
      toUsers.map(targetUserId => 
        this.graphMemory.createRelationship(
          memoryId,
          `shared:${targetUserId}`,
          'SHARED_WITH'
        )
      )
    );

    // Notify recipients
    toUsers.forEach(userId => {
      this.notifyUser(userId, {
        type: 'memory_shared',
        from: fromUser,
        memoryId,
        preview: context.substring(0, 100)
      });
    });
  }

  private async getAccessibleMemories(userId: string): Promise<any[]> {
    // Query graph for memories connected to user
    const session = this.graphMemory.driver.session();
    try {
      const result = await session.run(`
        MATCH (m:Memory)-[:OWNED_BY|SHARED_WITH]->(u:User {id: $userId})
        OPTIONAL MATCH (m)-[:IN_SPACE]->(s:Space)
        WHERE s IS NULL OR s.id IN $userSpaces
        RETURN m, s
        ORDER BY m.createdAt DESC
      `, { 
        userId,
        userSpaces: this.getUserSpaces(userId)
      });
      
      return result.records.map(r => ({
        ...r.get('m').properties,
        space: r.get('s')?.properties
      }));
    } finally {
      await session.close();
    }
  }

  private getUserSpaces(userId: string): string[] {
    return Array.from(this.spaces.values())
      .filter(s => s.members.includes(userId))
      .map(s => s.id);
  }

  private encryptKeyForStorage(key: string): string {
    const masterKey = process.env.MEMORY_MASTER_KEY!;
    return crypto.createHmac('sha256', masterKey).update(key).digest('hex');
  }

  private async encryptForUser(data: string, userId: string): Promise<string> {
    const publicKey = await this.getUserPublicKey(userId);
    return crypto.publicEncrypt(publicKey, Buffer.from(data)).toString('base64');
  }

  private async getUserPublicKey(userId: string): Promise<string> {
    // Fetch from secure user store or key server
    const session = this.graphMemory.driver.session();
    const result = await session.run(
      'MATCH (u:User {id: $id}) RETURN u.publicKey as key',
      { id: userId }
    );
    return result.records[0]?.get('key');
  }

  private createSecureToken(payload: any): string {
    const jwt = require('jsonwebtoken');
    return jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: '24h' });
  }

  private verifyToken(token: string): any {
    const jwt = require('jsonwebtoken');
    return jwt.verify(token, process.env.JWT_SECRET!);
  }

  private notifyUser(userId: string, message: any): void {
    const ws = this.wsClients.get(userId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
    // Also queue for push notification if offline
  }

  private broadcastToSpace(spaceId: string, message: any): void {
    const space = this.spaces.get(spaceId);
    space?.members.forEach(memberId => this.notifyUser(memberId, message));
  }

  async resolveConflict(
    memoryId: string,
    versions: Array<{ userId: string; content: string; timestamp: Date }>
  ): Promise<string> {
    // Last-write-wins with vector clock
    versions.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    
    // Or use CRDT (Conflict-free Replicated Data Type) for text
    const merged = this.mergeTextVersions(versions.map(v => v.content));
    
    await this.graphMemory.storeMemory(merged, {
      type: 'conflict_resolution',
      resolvedFrom: versions.map(v => v.userId),
      originalId: memoryId
    });
    
    return merged;
  }

  private mergeTextVersions(versions: string[]): string {
    // Simple three-way merge or use diff-match-patch
    const diffMatchPatch = require('diff-match-patch');
    const dmp = new diffMatchPatch();
    
    if (versions.length === 2) {
      const diffs = dmp.diff_main(versions[0], versions[1]);
      dmp.diff_cleanupSemantic(diffs);
      return dmp.patch_toText(dmp.patch_make(versions[0], diffs));
    }
    
    return versions[0]; // Fallback
  }

  registerWebSocket(userId: string, ws: WebSocket): void {
    this.wsClients.set(userId, ws);
    ws.on('close', () => this.wsClients.delete(userId));
  }
}
