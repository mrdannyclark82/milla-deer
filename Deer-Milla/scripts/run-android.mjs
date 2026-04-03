import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function parseJavaMajor(versionOutput) {
  const match = versionOutput.match(/version "([^"]+)"/);
  if (!match) {
    return null;
  }

  const [major] = match[1].split('.');
  return Number.parseInt(major, 10);
}

function readJavaVersion(env) {
  const result = spawnSync('java', ['-version'], {
    env,
    encoding: 'utf8',
  });

  const output = `${result.stdout || ''}${result.stderr || ''}`;
  return {
    output,
    major: parseJavaMajor(output),
    ok: result.status === 0,
  };
}

function isValidJavaHome(candidate) {
  return Boolean(candidate) && existsSync(path.join(candidate, 'bin', 'java'));
}

function findJava17Home() {
  const home = os.homedir();
  const candidates = [
    process.env.JAVA_HOME,
    '/usr/lib/jvm/java-17-openjdk',
    '/usr/lib/jvm/java-17-openjdk-amd64',
    '/usr/lib/jvm/jdk-17',
    path.join(home, '.local', 'jdks', 'jdk17', 'usr', 'lib', 'jvm', 'java-17-openjdk'),
  ].filter(Boolean);

  return candidates.find((candidate) => isValidJavaHome(candidate)) || null;
}

const current = readJavaVersion(process.env);
const env = { ...process.env };

if (current.major !== 17) {
  const java17Home = findJava17Home();
  if (!java17Home) {
    console.error(
      'Android development builds require JDK 17. Set JAVA_HOME to a valid JDK 17 install and retry.'
    );
    if (current.output.trim()) {
      console.error('\nCurrent java -version output:\n' + current.output.trim());
    }
    process.exit(1);
  }

  env.JAVA_HOME = java17Home;
  env.PATH = `${path.join(java17Home, 'bin')}${path.delimiter}${process.env.PATH || ''}`;
  const resolved = readJavaVersion(env);

  if (resolved.major !== 17) {
    console.error(
      `Resolved JAVA_HOME=${java17Home}, but java -version still does not report JDK 17.`
    );
    if (resolved.output.trim()) {
      console.error('\nResolved java -version output:\n' + resolved.output.trim());
    }
    process.exit(1);
  }

  console.log(`Using JDK 17 from ${java17Home}`);
}

const args = ['expo', 'run:android', ...process.argv.slice(2)];
const result = spawnSync('npx', args, {
  stdio: 'inherit',
  env,
});

process.exit(result.status ?? 1);
