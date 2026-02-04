import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import axios from 'axios';

const API_BASE_URL = process.env.API_URL || 'http://localhost:5000';

export const SandboxView: React.FC = () => {
  const [mode, setMode] = useState<'list' | 'details' | 'create'>('list');
  const [sandboxes, setSandboxes] = useState<any[]>([]);
  const [selectedSandbox, setSelectedSandbox] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [formStep, setFormStep] = useState(0);

  useEffect(() => {
    fetchSandboxes();
  }, []);

  const fetchSandboxes = async () => {
    setIsLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/api/sandboxes`);
      if (res.data.success) {
        setSandboxes(res.data.sandboxes);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelect = (item: any) => {
    if (item.value === 'create_new') {
      setMode('create');
      setFormStep(0);
      setNewName('');
      setNewDesc('');
    } else {
      setSelectedSandbox(item.original);
      setMode('details');
    }
  };

  const handleCreateSubmit = async () => {
    if (formStep === 0) {
      setFormStep(1);
      return;
    }

    setIsLoading(true);
    try {
      const res = await axios.post(`${API_BASE_URL}/api/sandboxes`, {
        name: newName,
        description: newDesc,
        createdBy: 'user',
      });
      if (res.data.success) {
        await fetchSandboxes();
        setMode('list');
      }
    } catch (e: any) {
      setError(e.message);
      setMode('list');
    } finally {
      setIsLoading(false);
    }
  };

  useInput((input, key) => {
    if (mode === 'details' && (key.escape || input === 'b')) {
      setMode('list');
    }
    if (mode === 'create' && key.escape) {
      setMode('list');
    }
  });

  if (isLoading && mode === 'list') {
    return (
      <Text>
        <Spinner type="dots" /> Loading sandboxes...
      </Text>
    );
  }

  if (mode === 'create') {
    return (
      <Box flexDirection="column" padding={1} borderStyle="single">
        <Text bold>Create New Sandbox</Text>
        <Box marginY={1}>
          <Text>Name: </Text>
          {formStep === 0 ? (
            <TextInput
              value={newName}
              onChange={setNewName}
              onSubmit={handleCreateSubmit}
            />
          ) : (
            <Text color="green">{newName}</Text>
          )}
        </Box>
        {formStep === 1 && (
          <Box>
            <Text>Description: </Text>
            <TextInput
              value={newDesc}
              onChange={setNewDesc}
              onSubmit={handleCreateSubmit}
            />
          </Box>
        )}
        <Text color="gray" marginTop={1}>
          Press Enter to confirm, Esc to cancel
        </Text>
      </Box>
    );
  }

  if (mode === 'details' && selectedSandbox) {
    return (
      <Box flexDirection="column" padding={1}>
        <Text bold color="magenta">
          {selectedSandbox.name}
        </Text>
        <Text italic>{selectedSandbox.description}</Text>
        <Box marginY={1} borderStyle="single" padding={1}>
          <Text>Status: {selectedSandbox.status}</Text>
          <Text>Branch: {selectedSandbox.branchName}</Text>
          <Text>Features: {selectedSandbox.features.length}</Text>
        </Box>
        <Text underline>Features:</Text>
        {selectedSandbox.features.map((f: any) => (
          <Box key={f.id} marginLeft={2}>
            <Text>
              - {f.name} ({f.status})
            </Text>
          </Box>
        ))}
        <Text color="gray" marginTop={2}>
          Press 'b' or Esc to go back
        </Text>
      </Box>
    );
  }

  const items = sandboxes.map((s) => ({
    label: s.name + (s.createdBy === 'milla' ? ' (AI)' : ''),
    value: s.id,
    original: s,
  }));

  items.unshift({
    label: '+ Create New Sandbox',
    value: 'create_new',
    original: null,
  });

  return (
    <Box flexDirection="column">
      <Text bold underline marginBottom={1}>
        Active Sandboxes
      </Text>
      <SelectInput items={items} onSelect={handleSelect} />
      {error && <Text color="red">{error}</Text>}
    </Box>
  );
};
