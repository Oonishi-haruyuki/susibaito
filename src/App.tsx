/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  User 
} from 'firebase/auth';
import { auth } from '@/src/lib/firebase';
import { SushiLayout } from '@/src/components/SushiLayout';
import { OrderManagement } from '@/src/components/OrderManagement';
import { InventoryManagement } from '@/src/components/InventoryManagement';
import { CustomerManagement } from '@/src/components/CustomerManagement';
import { MenuManagement } from '@/src/components/MenuManagement';
import { CustomerSimulator } from '@/src/components/CustomerSimulator';
import { Button } from '@/components/ui/button';
import { Toaster } from '@/components/ui/sonner';
import { ChefHat, LogIn } from 'lucide-react';
import { motion } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login Error:', error);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-zinc-50">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="bg-[#E31E24] p-3 rounded-sm rotate-45"
        >
          <ChefHat className="-rotate-45 text-white" size={32} />
        </motion.div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-full flex flex-col items-center justify-center bg-[#FDFCFB]">
        <div className="max-w-md w-full px-8 text-center space-y-8">
          <div className="inline-block bg-[#E31E24] p-4 rounded-xl rotate-12 shadow-xl shadow-red-500/20">
            <ChefHat className="-rotate-12 text-white" size={48} />
          </div>
          
          <div className="space-y-2">
            <h1 className="text-4xl font-serif tracking-tight text-zinc-900">寿司職人マネージャー</h1>
            <p className="text-zinc-500 font-sans leading-relaxed">
              店舗の注文、在庫、顧客を一括管理。<br />
              スタッフ専用の管理システムにログインしてください。
            </p>
          </div>

          <Button 
            onClick={handleLogin}
            className="w-full h-14 bg-[#1A1A1A] hover:bg-black text-white rounded-xl shadow-lg flex items-center justify-center gap-3 group transition-all"
          >
            <LogIn size={20} className="group-hover:rotate-12 transition-transform" />
            <span className="text-lg font-medium">Googleアカウントでログイン</span>
          </Button>

          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-400 font-mono">
            Secure Terminal v1.0.0
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <SushiLayout activeTab={activeTab} setActiveTab={setActiveTab} user={user}>
        {activeTab === 'orders' && <OrderManagement />}
        {activeTab === 'simulator' && <CustomerSimulator />}
        {activeTab === 'inventory' && <InventoryManagement />}
        {activeTab === 'customers' && <CustomerManagement />}
        {activeTab === 'menu' && <MenuManagement />}
      </SushiLayout>
      <Toaster position="top-center" richColors />
    </>
  );
}
