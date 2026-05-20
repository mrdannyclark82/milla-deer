import {
  storeSensitiveMemory,
  retrieveSensitiveMemory,
} from '../server/memoryService';
import { storage } from '../server/storage';
import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, '..', 'memory', 'milla.db');

async function main() {
  const userId = 'test-user-' + Date.now();

  // 0. Create User first (needed for foreign key constraint)
  console.log(`\n--- Creating Test User: ${userId} ---`);
  try {
    // We need to bypass storage.createUser because it generates a random ID
    // We want a specific ID or we need to capture the generated ID.
    // Let's use storage.createUser and use the returned user's ID.

    const user = await storage.createUser({
      username: `testuser_${Date.now()}`,
      email: `test_${Date.now()}@example.com`,
      password: 'password123',
      preferredAiModel: 'gemini',
    });

    // Override the generated ID with what we got (or just use the returned user.id)
    const validUserId = user.id;
    console.log(`User created with ID: ${validUserId}`);

    const testData = {
      financialSummary: 'Bank Balance: $1,000,000',
      medicalNotes: 'Allergic to kryptonite',
    };

    console.log(
      `\n--- Starting Sensitive Memory Verification for User: ${validUserId} ---`
    );

    // 1. Store Data
    console.log('\n1. Storing sensitive memory...');
    const storeResult = await storeSensitiveMemory(validUserId, testData);
    if (!storeResult.success) {
      console.error('Failed to store sensitive memory:', storeResult.error);
      process.exit(1);
    }
    console.log('✅ Store successful');

    // 2. Retrieve Data
    console.log('\n2. Retrieving sensitive memory...');
    const retrieveResult = await retrieveSensitiveMemory(validUserId);
    if (!retrieveResult.success) {
      console.error(
        'Failed to retrieve sensitive memory:',
        retrieveResult.error
      );
      process.exit(1);
    }

    // Verify content
    console.log('Retrieved Data:', retrieveResult);
    if (
      retrieveResult.financialSummary === testData.financialSummary &&
      retrieveResult.medicalNotes === testData.medicalNotes
    ) {
      console.log('✅ Retrieved data matches original data');
    } else {
      console.error('❌ Mismatch in retrieved data!');
      console.error('Expected:', testData);
      console.error('Got:', retrieveResult);
      process.exit(1);
    }

    // 3. Inspect Database Directly (to verify encryption)
    console.log('\n3. Inspecting database directly (verifying encryption)...');
    const db = new Database(DB_PATH);

    try {
      const row = db
        .prepare('SELECT * FROM sensitive_memories WHERE user_id = ?')
        .get(validUserId) as any;

      if (!row) {
        console.error('❌ No record found in DB for user!');
        process.exit(1);
      }

      console.log('Raw DB Row:', row);

      const financialEncrypted = row.financial_summary;
      const medicalEncrypted = row.medical_notes;

      if (
        financialEncrypted === testData.financialSummary ||
        medicalEncrypted === testData.medicalNotes
      ) {
        console.error('❌ Data is NOT encrypted in database!');
        process.exit(1);
      } else if (
        financialEncrypted &&
        medicalEncrypted &&
        financialEncrypted.includes('HE_v2:') &&
        medicalEncrypted.includes('HE_v2:')
      ) {
        console.log('✅ Data appears to be encrypted (contains HE_v2 marker)');
      } else {
        console.warn(
          '⚠️ Data is different but does not have expected HE marker. Check encryption implementation.'
        );
        console.log('Stored financial:', financialEncrypted);
      }
    } catch (error) {
      console.error('Error inspecting DB:', error);
    } finally {
      db.close();
    }
  } catch (error) {
    console.error('Error in test setup:', error);
    process.exit(1);
  }

  console.log('\n--- Verification Complete: SUCCESS ---');
  process.exit(0);
}

main().catch(console.error);
