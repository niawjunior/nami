import { useState, useEffect, useCallback } from 'react';

export interface AutomationRule {
  id: string;
  name: string;
  enabled: boolean;
  sourcePath: string;
  trigger: 'on_add';
  conditions: {
    type: 'extension' | 'name_contains' | 'size_gt';
    value: string | number;
  }[];
  action: {
    type: 'move' | 'copy' | 'trash';
    destination?: string;
  };
}

export function useAutomation() {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [globalEnabled, setGlobalEnabled] = useState(true);
  const [loading, setLoading] = useState(true);

  // Load initial state
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [fetchedRules, status] = await Promise.all([
        window.electron.automation.getRules(),
        window.electron.automation.getStatus()
      ]);
      setRules(fetchedRules || []);
      setGlobalEnabled(status);
    } catch (err) {
      console.error('Failed to load automation data:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveRule = async (rule: AutomationRule) => {
    try {
      const updatedRules = await window.electron.automation.saveRule(rule);
      setRules(updatedRules);
      return true;
    } catch (err) {
      console.error('Failed to save rule:', err);
      return false;
    }
  };

  const deleteRule = async (id: string) => {
    try {
      const updatedRules = await window.electron.automation.deleteRule(id);
      setRules(updatedRules);
      return true;
    } catch (err) {
      console.error('Failed to delete rule:', err);
      return false;
    }
  };

  const toggleRule = async (id: string, enabled: boolean) => {
    try {
      const updatedRules = await window.electron.automation.toggleRule(id, enabled);
      setRules(updatedRules);
    } catch (err) {
      console.error('Failed to toggle rule:', err);
    }
  };

  const toggleGlobal = async (enabled: boolean) => {
    try {
      await window.electron.automation.toggleGlobal(enabled);
      setGlobalEnabled(enabled);
    } catch (err) {
      console.error('Failed to toggle global automation:', err);
    }
  };

  return {
    rules,
    globalEnabled,
    loading,
    saveRule,
    deleteRule,
    toggleRule,
    toggleGlobal,
    refresh: loadData
  };
}
