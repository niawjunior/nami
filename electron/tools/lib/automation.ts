import Store from 'electron-store';
import chokidar from 'chokidar';
import path from 'path';
import { fsTools } from '../fs';

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

interface AutomationStore {
  rules: AutomationRule[];
  globalEnabled: boolean;
}

export class RuleEngine {
  private store: Store<AutomationStore>;
  private watchers: Map<string, any> = new Map();
  private processing: Set<string> = new Set(); // Prevent duplicate processing

  constructor() {
    this.store = new Store<AutomationStore>({
      defaults: {
        rules: [],
        globalEnabled: true
      }
    });
    
    this.initWatchers();
  }

  // Reload watchers based on current rules
  public initWatchers() {
    // 1. Close existing watchers
    this.watchers.forEach(watcher => watcher.close());
    this.watchers.clear();

    if (!this.store.get('globalEnabled')) {
      console.log('[Automation] Global automation disabled');
      return;
    }

    const rules = this.store.get('rules');
    const enabledRules = rules.filter(r => r.enabled);

    // Group rules by source path to avoid multiple watchers on same folder
    const rulesByPath = new Map<string, AutomationRule[]>();
    enabledRules.forEach(rule => {
      if (!rulesByPath.has(rule.sourcePath)) {
        rulesByPath.set(rule.sourcePath, []);
      }
      rulesByPath.get(rule.sourcePath)!.push(rule);
    });

    // Create watcher for each unique path
    rulesByPath.forEach((pathRules, sourcePath) => {
      try {
        console.log(`[Automation] Watching ${sourcePath} for ${pathRules.length} rules`);
        const watcher = chokidar.watch(sourcePath, {
          persistent: true,
          ignoreInitial: true, // Only watch new files
          depth: 0, // Only top level
          awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
          }
        });

        watcher.on('add', async (filePath) => {
          await this.handleFileAdd(filePath, pathRules);
        });

        this.watchers.set(sourcePath, watcher);
      } catch (err) {
        console.error(`[Automation] Failed to watch ${sourcePath}:`, err);
      }
    });
  }

  private async handleFileAdd(filePath: string, rules: AutomationRule[]) {
    if (this.processing.has(filePath)) return;
    this.processing.add(filePath);

    try {
      console.log(`[Automation] New file detected: ${filePath}`);
      const fileName = path.basename(filePath);
      const ext = path.extname(filePath).toLowerCase().replace('.', '');
      
      // Determine file size only if needed by any rule (optimization)
      let fileSize = 0;
      const sizeNeeded = rules.some(r => r.conditions.some(c => c.type === 'size_gt'));
      if (sizeNeeded) {
        // You would import fs here normally, or use fsTools mock
        // For simplicity assuming we can access fs via node
        const { stat } = require('fs/promises');
        const stats = await stat(filePath);
        fileSize = stats.size;
      }

      // Check rules in order
      for (const rule of rules) {
        if (this.matchesRule(rule, fileName, ext, fileSize)) {
          console.log(`[Automation] Matched rule "${rule.name}" -> ${rule.action.type}`);
          await this.executeAction(rule, filePath);
          break; // Stop after first match? Or continue? Usually first match wins for move/trash.
        }
      }
    } catch (err) {
      console.error(`[Automation] Error processing file ${filePath}:`, err);
    } finally {
      this.processing.delete(filePath);
    }
  }

  private matchesRule(rule: AutomationRule, fileName: string, ext: string, size: number): boolean {
    return rule.conditions.every(condition => {
      switch (condition.type) {
        case 'extension':
          // condition.value might be "pdf" or ".pdf"
          const targetExt = String(condition.value).toLowerCase().replace('.', '');
          return ext === targetExt;
        case 'name_contains':
          return fileName.toLowerCase().includes(String(condition.value).toLowerCase());
        case 'size_gt':
          // Assume value is in bytes
          return size > Number(condition.value);
        default:
          return false;
      }
    });
  }

  private async executeAction(rule: AutomationRule, filePath: string) {
    const { action } = rule;
    
    if (action.type === 'move' && action.destination) {
      // Use existing moveFiles tool logic but adapted for single file internal call
      // We can use fsTools.moveFiles if it's exported, or cleaner: check if fsTools exposes single move
      await fsTools.moveFiles({ 
        sources: [filePath], 
        destination: action.destination 
      });
    } else if (action.type === 'copy' && action.destination) {
      await fsTools.copyFiles({
        sources: [filePath],
        destination: action.destination
      });
    } else if (action.type === 'trash') {
      await fsTools.trashFiles({
        paths: [filePath]
      });
    }
  }

  // --- Public API for IPC ---

  public getRules() {
    return this.store.get('rules');
  }

  public getGlobalEnabled() {
    return this.store.get('globalEnabled');
  }

  public toggleGlobal(enabled: boolean) {
    this.store.set('globalEnabled', enabled);
    this.initWatchers();
    return enabled;
  }

  public saveRule(rule: AutomationRule) {
    const rules = this.store.get('rules');
    const index = rules.findIndex(r => r.id === rule.id);
    
    if (index >= 0) {
      rules[index] = rule;
    } else {
      rules.push(rule);
    }
    
    this.store.set('rules', rules);
    this.initWatchers(); // Restart watchers to apply changes
    return rules;
  }

  public deleteRule(id: string) {
    const rules = this.store.get('rules');
    const newRules = rules.filter(r => r.id !== id);
    this.store.set('rules', newRules);
    this.initWatchers();
    return newRules;
  }

  public toggleRule(id: string, enabled: boolean) {
    const rules = this.store.get('rules');
    const rule = rules.find(r => r.id === id);
    if (rule) {
      rule.enabled = enabled;
      this.store.set('rules', rules);
      this.initWatchers();
    }
    return rules;
  }
}

export const automation = new RuleEngine();
