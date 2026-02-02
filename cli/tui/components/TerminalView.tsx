import React, { useState, useEffect, useRef } from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { exec } from 'child_process';

interface TerminalLine {
    type: 'command' | 'stdout' | 'stderr' | 'info';
    content: string;
}

export const TerminalView: React.FC = () => {
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<TerminalLine[]>([
      { type: 'info', content: 'Milla Terminal Wrapper v1.0' },
      { type: 'info', content: 'Type a command and press Enter.' }
  ]);
  const [cwd, setCwd] = useState(process.cwd());

  const handleCommand = () => {
    if (!input.trim()) return;

    const cmd = input.trim();
    setHistory(prev => [...prev, { type: 'command', content: `${cwd} $ ${cmd}` }]);
    setInput('');

    // Handle 'cd' manually because it affects the process environment for future commands
    if (cmd.startsWith('cd ')) {
        const target = cmd.substring(3).trim();
        try {
            process.chdir(target);
            setCwd(process.cwd());
        } catch (err: any) {
            setHistory(prev => [...prev, { type: 'stderr', content: err.message }]);
        }
        return;
    }

    exec(cmd, { cwd }, (error, stdout, stderr) => {
        if (stdout) {
            setHistory(prev => [...prev, { type: 'stdout', content: stdout }]);
        }
        if (stderr) {
            setHistory(prev => [...prev, { type: 'stderr', content: stderr }]);
        }
        if (error) {
            // error.message often duplicates stderr, so handled carefully
        }
    });
  };

  return (
    <Box flexDirection="column" height="100%">
      <Box flexGrow={1} flexDirection="column" justifyContent="flex-end" overflow="hidden">
        {history.slice(-20).map((line, i) => (
            <Box key={i}>
                <Text
                    color={
                        line.type === 'command' ? 'yellow' :
                        line.type === 'stderr' ? 'red' :
                        line.type === 'info' ? 'blue' : 'white'
                    }
                >
                    {line.content}
                </Text>
            </Box>
        ))}
      </Box>

      <Box borderStyle="single" borderColor="yellow" paddingX={1}>
        <Text color="yellow">$ </Text>
        <TextInput value={input} onChange={setInput} onSubmit={handleCommand} />
      </Box>
    </Box>
  );
};
