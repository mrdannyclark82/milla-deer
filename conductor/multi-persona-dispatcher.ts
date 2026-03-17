const TOKEN = process.env.EXPO_PUBLIC_SESSION_TOKEN ?? (() => { throw new Error("token required"); })();
