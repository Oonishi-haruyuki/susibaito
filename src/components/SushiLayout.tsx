import React from 'react';
import { ChefHat, ClipboardList, Package, Users, Settings, LogOut, PlayCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { auth } from '@/src/lib/firebase';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface SushiLayoutProps {
  children: React.ReactNode;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  user: any;
}

const tabs = [
  { id: 'orders', label: '注文管理', icon: ClipboardList },
  { id: 'simulator', label: '来店シミュレータ', icon: PlayCircle },
  { id: 'inventory', label: '在庫管理', icon: Package },
  { id: 'customers', label: '顧客管理', icon: Users },
  { id: 'menu', label: '品書き管理', icon: ChefHat },
];

export function SushiLayout({ children, activeTab, setActiveTab, user }: SushiLayoutProps) {
  return (
    <div className="flex h-screen bg-[#FDFCFB]">
      {/* Sidebar */}
      <aside className="w-64 bg-[#1A1A1A] text-white flex flex-col border-r border-[#333]">
        <div className="p-6 flex items-center gap-3">
          <div className="bg-[#E31E24] p-2 rounded-sm rotate-45">
            <ChefHat className="-rotate-45 text-white" size={24} />
          </div>
          <div>
            <h1 className="font-serif text-xl tracking-tight">寿司職人</h1>
            <p className="text-[10px] uppercase tracking-widest text-zinc-500">Master Manager</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 group",
                  isActive 
                    ? "bg-[#E31E24] text-white" 
                    : "text-zinc-400 hover:text-white hover:bg-zinc-800/50"
                )}
              >
                <Icon size={18} className={cn(
                  "transition-transform",
                  isActive ? "scale-110" : "group-hover:scale-110"
                )} />
                <span className="font-medium text-sm">{tab.label}</span>
                {isActive && (
                  <motion.div 
                    layoutId="activeTab"
                    className="ml-auto w-1.5 h-1.5 bg-white rounded-full"
                  />
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-zinc-800">
          <div className="flex items-center gap-3 px-4 py-3 mb-4">
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center text-xs font-bold font-serif">
              {user?.email?.[0].toUpperCase()}
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="text-sm font-medium truncate">{user?.email}</p>
              <p className="text-[10px] text-zinc-500 uppercase tracking-wider">Staff</p>
            </div>
          </div>
          <Button 
            variant="ghost" 
            className="w-full justify-start text-zinc-400 hover:text-[#E31E24] hover:bg-[#E31E24]/10"
            onClick={() => auth.signOut()}
          >
            <LogOut size={16} className="mr-2" />
            <span>ログアウト</span>
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col relative">
        <header className="h-16 border-bottom border-zinc-200 bg-white/80 backdrop-blur-md flex items-center justify-between px-8 z-10">
          <h2 className="text-lg font-serif font-medium text-zinc-900 capitalize">
            {tabs.find(t => t.id === activeTab)?.label}
          </h2>
          <div className="flex items-center gap-4 text-xs font-mono text-zinc-500">
            <span className="px-2 py-1 bg-zinc-100 rounded">v1.0.0</span>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
              className="h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}
