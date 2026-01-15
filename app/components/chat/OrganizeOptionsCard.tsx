'use client';

import { Sparkles, List, Trash2 } from 'lucide-react';

interface OrganizeOption {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  recommended?: boolean;
}

interface OrganizeOptionsCardProps {
  folderPath: string;
  analysis: {
    totalFiles: number;
    categories: Record<string, { count: number }>;
    potentialDuplicates: number;
  };
  onSelectOption: (option: string) => void;
}

const options: OrganizeOption[] = [
  {
    id: 'full-auto',
    title: 'Full auto-organize',
    description: "I'll create folders by type (Images, Documents, Videos, etc.) and move everything automatically",
    icon: <Sparkles className="w-5 h-5" />,
    recommended: true,
  },
  {
    id: 'review-plan',
    title: 'Review plan first',
    description: "I'll show you the proposed folder structure and what goes where before moving anything",
    icon: <List className="w-5 h-5" />,
  },
  {
    id: 'clean-junk',
    title: 'Just clean up junk',
    description: "Only remove clearly temporary files (empty files, duplicates) and leave the rest",
    icon: <Trash2 className="w-5 h-5" />,
  },
];

export function OrganizeOptionsCard({ folderPath, analysis, onSelectOption }: OrganizeOptionsCardProps) {
  // Build summary text
  const summaryParts: string[] = [];
  if (analysis.categories) {
    Object.entries(analysis.categories).forEach(([cat, info]) => {
      if (info.count > 0) {
        summaryParts.push(`~${info.count} ${cat.toLowerCase()}`);
      }
    });
  }
  
  return (
    <div className="flex flex-col gap-3 max-w-md">
      {/* Analysis Summary */}
      <div className="text-sm text-foreground/80">
        <p className="font-medium mb-2">
          I found {analysis.totalFiles} files in this folder:
        </p>
        <ul className="list-disc list-inside space-y-1 text-foreground/70">
          {summaryParts.slice(0, 5).map((part, i) => (
            <li key={i}>{part}</li>
          ))}
          {analysis.potentialDuplicates > 0 && (
            <li>{analysis.potentialDuplicates} potential duplicates</li>
          )}
        </ul>
      </div>
      
      {/* Options Header */}
      <div className="text-sm font-medium text-foreground/60 mt-2">
        How would you like me to organize this folder?
      </div>
      
      {/* Option Cards */}
      <div className="flex flex-col gap-2">
        {options.map((option, index) => (
          <button
            key={option.id}
            onClick={() => onSelectOption(option.id)}
            className={`
              group relative flex items-start gap-3 p-3 rounded-lg border text-left
              transition-all duration-200 hover:scale-[1.01]
              ${option.recommended 
                ? 'bg-blue-500/10 border-blue-500/30 hover:bg-blue-500/20 hover:border-blue-500/50' 
                : 'bg-muted/50 border-border hover:bg-muted hover:border-foreground/20'}
            `}
          >
            <div className={`
              flex-shrink-0 p-1.5 rounded-md
              ${option.recommended ? 'bg-blue-500/20 text-blue-500' : 'bg-foreground/10 text-foreground/60'}
            `}>
              {option.icon}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{option.title}</span>
                {option.recommended && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-500 font-medium">
                    Recommended
                  </span>
                )}
              </div>
              <p className="text-xs text-foreground/60 mt-0.5 line-clamp-2">
                {option.description}
              </p>
            </div>
            <div className="flex-shrink-0 w-6 h-6 rounded-full bg-foreground/10 flex items-center justify-center text-xs font-medium">
              {index + 1}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
