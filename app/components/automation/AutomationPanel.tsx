'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAutomation, AutomationRule } from '../chat/hooks/useAutomation';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, FolderOpen, ArrowRight, X, Play, Pause, Save, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AutomationPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AutomationPanel({ isOpen, onClose }: AutomationPanelProps) {
  const { rules, globalEnabled, loading, saveRule, deleteRule, toggleRule, toggleGlobal } = useAutomation();
  const [isCreating, setIsCreating] = useState(false);
  const [newRule, setNewRule] = useState<Partial<AutomationRule>>({
    name: '',
    sourcePath: '',
    trigger: 'on_add',
    conditions: [{ type: 'extension', value: '' }],
    action: { type: 'move', destination: '' },
    enabled: true
  });

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!newRule.name || !newRule.sourcePath || !newRule.action?.destination) return;
    
    // Auto-generate ID if new
    const ruleToSave = {
      ...newRule,
      id: newRule.id || `rule_${Date.now()}`
    } as AutomationRule;

    await saveRule(ruleToSave);
    setIsCreating(false);
    setNewRule({
        name: '',
        sourcePath: '',
        trigger: 'on_add',
        conditions: [{ type: 'extension', value: '' }],
        action: { type: 'move', destination: '' },
        enabled: true
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-card w-full max-w-3xl h-[80vh] rounded-xl border border-border shadow-2xl flex flex-col overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-border flex items-center justify-between bg-secondary/10">
            <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Play className="w-5 h-5 text-primary" />
                    Smart Automation
                </h2>
                <p className="text-sm text-muted-foreground">Manage your magic folders and rules</p>
            </div>
            <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 bg-background/50 px-3 py-1.5 rounded-full border border-border/50">
                    <span className="text-sm font-medium">Global Status</span>
                    <Switch 
                        checked={globalEnabled} 
                        onCheckedChange={toggleGlobal} 
                    />
                </div>
                <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-destructive/10 hover:text-destructive">
                    <X className="w-5 h-5" />
                </Button>
            </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-background/50">
            {loading ? (
                <div className="flex justify-center items-center h-full">Loading rules...</div>
            ) : (
                <div className="space-y-6">
                    {/* Active Rules List */}
                    <div className="grid grid-cols-1 gap-4">
                        {rules.map((rule) => (
                            <div key={rule.id} className={cn(
                                "group bg-card border rounded-lg p-4 transition-all hover:shadow-md hover:border-primary/20",
                                !rule.enabled && "opacity-60 grayscale-[0.5]"
                            )}>
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className={cn("w-2 h-2 rounded-full", rule.enabled ? "bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" : "bg-gray-400")} />
                                        <h3 className="font-semibold text-base">{rule.name}</h3>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Switch 
                                            checked={rule.enabled} 
                                            onCheckedChange={(checked) => toggleRule(rule.id, checked)}
                                        />
                                        <Button 
                                            variant="ghost" 
                                            size="icon" 
                                            className="h-8 w-8 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
                                            onClick={() => deleteRule(rule.id)}
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                                
                                <div className="flex items-center gap-3 text-sm text-muted-foreground bg-secondary/30 p-2.5 rounded-md font-mono">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <Folder className="w-4 h-4 text-blue-400 shrink-0" />
                                        <span className="truncate max-w-[150px]" title={rule.sourcePath}>{rule.sourcePath.split('/').pop()}</span>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                                    <div className="flex items-center gap-1.5 shrink-0 px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                                        <span>If {rule.conditions[0].type === 'extension' ? 'ext is' : 'name has'}</span>
                                        <strong>"{rule.conditions[0].value}"</strong>
                                    </div>
                                    <ArrowRight className="w-4 h-4 text-primary shrink-0" />
                                    <div className="flex items-center gap-1.5 min-w-0">
                                        <span className="uppercase text-xs font-bold">{rule.action.type} to</span>
                                        <span className="truncate max-w-[150px]" title={rule.action.destination}>{rule.action.destination?.split('/').pop()}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* New Rule Form */}
                    {isCreating ? (
                        <div className="bg-card border-2 border-primary/20 rounded-xl p-5 shadow-sm animate-in zoom-in-95 duration-200">
                            <h3 className="font-semibold mb-4 text-lg">New Rule</h3>
                            <div className="grid grid-cols-2 gap-4 mb-4">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Rule Name</label>
                                    <input 
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-primary/20 outline-none"
                                        placeholder="e.g. Move PDFs to Documents"
                                        value={newRule.name}
                                        onChange={(e) => setNewRule({...newRule, name: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Watch Folder (Source)</label>
                                    <div className="flex gap-2">
                                        <input 
                                            className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm font-mono"
                                            placeholder="/Users/..."
                                            value={newRule.sourcePath}
                                            onChange={(e) => setNewRule({...newRule, sourcePath: e.target.value})}
                                        />
                                    </div>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 mb-6">
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Condition (Extension)</label>
                                    <input 
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm font-mono"
                                        placeholder="pdf"
                                        value={newRule.conditions?.[0].value}
                                        onChange={(e) => setNewRule({
                                            ...newRule, 
                                            conditions: [{ type: 'extension', value: e.target.value }]
                                        })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-xs font-medium text-muted-foreground">Action (Move To)</label>
                                    <input 
                                        className="w-full bg-background border border-input rounded-md px-3 py-2 text-sm font-mono"
                                        placeholder="/Users/..."
                                        value={newRule.action?.destination}
                                        onChange={(e) => setNewRule({
                                            ...newRule, 
                                            action: { type: 'move', destination: e.target.value }
                                        })}
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end gap-3">
                                <Button variant="ghost" onClick={() => setIsCreating(false)}>Cancel</Button>
                                <Button onClick={handleSave} className="gap-2">
                                    <Save className="w-4 h-4" />
                                    Save Rule
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <Button 
                            variant="outline" 
                            className="w-full h-14 border-dashed border-2 hover:border-primary hover:bg-primary/5 gap-2 text-muted-foreground"
                            onClick={() => setIsCreating(true)}
                        >
                            <Plus className="w-5 h-5" />
                            Create New Automation Rule
                        </Button>
                    )}
                </div>
            )}
        </div>
      </motion.div>
    </div>
  );
}
