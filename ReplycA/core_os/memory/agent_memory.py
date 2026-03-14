import sqlite3
import os
from datetime import datetime

class AgentMemory:
    def __init__(self, db_path="core_os/memory/agent_memory.db"):
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        self.conn = sqlite3.connect(db_path, check_same_thread=False)
        self.cursor = self.conn.cursor()
        self.cursor.execute('CREATE TABLE IF NOT EXISTS mem (k TEXT PRIMARY KEY, v TEXT, t DATETIME)')
        self.conn.commit()

    def remember(self, key, value):
        self.cursor.execute("INSERT OR REPLACE INTO mem VALUES (?, ?, ?)", (key, value, datetime.now()))
        self.conn.commit()
        return f"Memory Locked: {key}"

    def recall(self, key):
        self.cursor.execute("SELECT v FROM mem WHERE k=?", (key,))
        res = self.cursor.fetchone()
        return res[0] if res else "None."

# Singleton instance
memory = AgentMemory()
