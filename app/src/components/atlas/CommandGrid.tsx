import { useMemo } from 'react';
import { motion } from 'framer-motion';
import CommandCard from './CommandCard';
import type { CommandData } from '@/data/commands';
import { learnedCommandIds } from '@/data/commands';
import { Search } from 'lucide-react';

interface CommandGridProps {
  commands: CommandData[];
}

export default function CommandGrid({ commands }: CommandGridProps) {
  const isLearned = useMemo(() => {
    const set = learnedCommandIds;
    return (id: string) => set.has(id);
  }, []);

  if (commands.length === 0) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex flex-col items-center justify-center py-20"
      >
        <Search size={48} className="text-[#4A6072] mb-4" />
        <h3 className="font-jetbrains text-h3 text-[#8B9EB0]">
          No commands match your search
        </h3>
        <p className="font-inter text-body text-[#4A6072] mt-2">
          Try different keywords or clear filters
        </p>
      </motion.div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {commands.map((cmd, i) => (
        <CommandCard
          key={cmd.id}
          command={cmd}
          isLearned={isLearned(cmd.id)}
          index={i}
        />
      ))}
    </div>
  );
}
