import React, { useState, useEffect, useRef, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { 
  OrbitControls, 
  PerspectiveCamera, 
  Environment, 
  Text, 
  Float, 
  Box, 
  Cylinder,
  RoundedBox,
  Html
} from '@react-three/drei';
import * as THREE from 'three';
import { collection, query, onSnapshot, addDoc, Timestamp, runTransaction, doc, increment } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { MenuItem, Order } from '@/src/types';
import { Button } from '@/components/ui/button';
import { ChefHat, ShoppingCart, User as UserIcon, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';

// --- 3D Components ---

function Table() {
  return (
    <group position={[0, -1, 0]}>
      {/* Counter Top */}
      <RoundedBox args={[12, 0.5, 4]} radius={0.1} smoothness={4} position={[0, 1.2, 0]}>
        <meshStandardMaterial color="#2A2A2A" roughness={0.1} metalness={0.5} />
      </RoundedBox>
      {/* Base */}
      <Box args={[11.5, 2.4, 3.5]} position={[0, -0.2, -0.2]}>
        <meshStandardMaterial color="#1A1A1A" />
      </Box>
      
      {/* Stools (Customers sit here) */}
      <Stool position={[-3, 0.2, 2.5]} />
      <Stool position={[0, 0.2, 2.5]} />
      <Stool position={[3, 0.2, 2.5]} />
    </group>
  );
}

function Stool({ position }: { position: [number, number, number] }) {
  return (
    <group position={position}>
      {/* Seat */}
      <Cylinder args={[0.6, 0.6, 0.15, 32]} position={[0, 0.7, 0]}>
        <meshStandardMaterial color="#E31E24" />
      </Cylinder>
      {/* Leg */}
      <Cylinder args={[0.05, 0.1, 0.7, 16]} position={[0, 0.35, 0]}>
        <meshStandardMaterial color="#444" metalness={0.8} roughness={0.2} />
      </Cylinder>
      {/* Base */}
      <Cylinder args={[0.4, 0.4, 0.05, 32]}>
        <meshStandardMaterial color="#222" />
      </Cylinder>
    </group>
  );
}

function Chef() {
  const meshRef = useRef<THREE.Group>(null);
  
  useFrame((state) => {
    if (meshRef.current) {
      // Subtle swaying animation while working
      meshRef.current.rotation.y = Math.sin(state.clock.getElapsedTime()) * 0.1;
      meshRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 2) * 0.02;
    }
  });

  return (
    <group position={[0, 0, -2.5]} ref={meshRef}>
      {/* Body */}
      <mesh position={[0, 0.8, 0]}>
        <capsuleGeometry args={[0.4, 0.8, 4, 16]} />
        <meshStandardMaterial color="#FFFFFF" /> {/* White chef coat */}
      </mesh>
      
      {/* Chef Hat */}
      <group position={[0, 1.8, 0]}>
        <Cylinder args={[0.25, 0.25, 0.4, 16]}>
          <meshStandardMaterial color="#FFFFFF" />
        </Cylinder>
        <Cylinder args={[0.3, 0.3, 0.1, 16]} position={[0, 0.2, 0]}>
          <meshStandardMaterial color="#FFFFFF" />
        </Cylinder>
      </group>
      
      {/* Face (Eyes) */}
      <mesh position={[-0.15, 1.45, 0.35]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[0.15, 1.45, 0.35]}>
        <sphereGeometry args={[0.04, 8, 8]} />
        <meshStandardMaterial color="black" />
      </mesh>

      {/* Floating Badge */}
      <Html position={[0, 2.4, 0]} center>
        <div className="bg-black/80 text-white text-[10px] px-2 py-1 rounded-full whitespace-nowrap border border-white/20 scale-75">
          🍣 Master Chef
        </div>
      </Html>

      {/* Working Area / Cutting Board */}
      <RoundedBox args={[1.5, 0.1, 1]} radius={0.05} position={[0, 0.2, 1.5]}>
        <meshStandardMaterial color="#F5DEB3" /> {/* Wood color */}
      </RoundedBox>
    </group>
  );
}

function SushiPlate({ color = "#FFFFFF", position = [0, 0.3, 0] as [number, number, number] }) {
  return (
    <group position={position}>
      <Cylinder args={[0.5, 0.4, 0.1, 32]}>
        <meshStandardMaterial color={color} />
      </Cylinder>
      <mesh position={[0, 0.1, 0]}>
        <boxGeometry args={[0.4, 0.2, 0.2]} />
        <meshStandardMaterial color="#FFEEEE" />
      </mesh>
      <mesh position={[0, 0.2, 0]}>
        <boxGeometry args={[0.45, 0.05, 0.25]} />
        <meshStandardMaterial color="#E31E24" />
      </mesh>
    </group>
  );
}

interface SimulatedCustomer {
  id: string;
  name: string;
  orderItem: MenuItem;
  position: [number, number, number];
  status: 'thinking' | 'ordered' | 'waiting';
}

function CustomerMesh({ customer, onOrder }: { customer: SimulatedCustomer, onOrder: (c: SimulatedCustomer) => void }) {
  const [hovered, setHovered] = useState(false);
  const meshRef = useRef<THREE.Group>(null);

  useFrame((state) => {
    if (meshRef.current) {
      meshRef.current.position.y = Math.sin(state.clock.getElapsedTime() * 2) * 0.05;
    }
  });

  return (
    <group position={customer.position} ref={meshRef}>
      {/* Body */}
      <mesh onPointerOver={() => setHovered(true)} onPointerOut={() => setHovered(false)}>
        <capsuleGeometry args={[0.4, 1, 4, 16]} />
        <meshStandardMaterial color={hovered ? "#444" : "#222"} />
      </mesh>
      
      {/* Order Bubble */}
      <Html position={[0, 1.8, 0]} center>
        <motion.div 
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-white p-3 rounded-2xl shadow-xl border border-zinc-100 whitespace-nowrap min-w-[120px]"
        >
          <p className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider mb-1">Customer Order</p>
          <p className="text-sm font-serif font-medium">{customer.orderItem.name}</p>
          <p className="text-xs font-mono text-zinc-500 mb-2">¥{customer.orderItem.price}</p>
          
          {customer.status === 'thinking' ? (
            <div className="flex gap-1 justify-center py-2">
              <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1 }} className="w-1.5 h-1.5 bg-zinc-300 rounded-full" />
              <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.2 }} className="w-1.5 h-1.5 bg-zinc-300 rounded-full" />
              <motion.div animate={{ opacity: [0, 1, 0] }} transition={{ repeat: Infinity, duration: 1, delay: 0.4 }} className="w-1.5 h-1.5 bg-zinc-300 rounded-full" />
            </div>
          ) : (
            <Button 
              size="sm" 
              className="w-full bg-[#E31E24] hover:bg-[#C21A1F] h-7 text-[10px]"
              onClick={() => onOrder(customer)}
            >
              受け付ける
            </Button>
          )}
        </motion.div>
      </Html>
    </group>
  );
}

export function CustomerSimulator() {
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [activeCustomers, setActiveCustomers] = useState<SimulatedCustomer[]>([]);
  const [score, setScore] = useState(0);

  useEffect(() => {
    const q = query(collection(db, 'menu'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMenuItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    });
    return () => unsubscribe();
  }, []);

  // Spawn customers
  useEffect(() => {
    if (menuItems.length === 0) return;

    const interval = setInterval(() => {
      if (activeCustomers.length < 3) {
        const randomItem = menuItems[Math.floor(Math.random() * menuItems.length)];
        const newCustomer: SimulatedCustomer = {
          id: Math.random().toString(36).substr(2, 9),
          name: `Guest ${activeCustomers.length + 1}`,
          orderItem: randomItem,
          position: [(activeCustomers.length - 1) * 3, 0.8, 2.5],
          status: 'thinking'
        };

        setActiveCustomers(prev => [...prev, newCustomer]);

        // After 2 seconds, they decide what to order
        setTimeout(() => {
          setActiveCustomers(prev => prev.map(c => 
            c.id === newCustomer.id ? { ...c, status: 'ordered' } : c
          ));
        }, 2000);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [menuItems, activeCustomers]);

  const handleOrderAccept = async (customer: SimulatedCustomer) => {
    try {
      await runTransaction(db, async (transaction) => {
        // 1. Create the order
        const orderRef = doc(collection(db, 'orders'));
        const orderData: Omit<Order, 'id'> = {
          tableNumber: Math.floor(Math.random() * 10) + 1,
          type: 'eat-in',
          status: 'received',
          items: [{
            name: customer.orderItem.name,
            quantity: 1,
            price: customer.orderItem.price
          }],
          totalAmount: customer.orderItem.price,
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now()
        };
        transaction.set(orderRef, orderData);

        // 2. Reduce inventory based on ingredients
        if (customer.orderItem.ingredients && customer.orderItem.ingredients.length > 0) {
          customer.orderItem.ingredients.forEach(ingredient => {
            const inventoryRef = doc(db, 'inventory', ingredient.inventoryItemId);
            // decrement quantity
            transaction.update(inventoryRef, {
              quantity: increment(-ingredient.quantity),
              updatedAt: Timestamp.now()
            });
          });
        }
      });
      
      // Remove customer from sim
      setActiveCustomers(prev => prev.filter(c => c.id !== customer.id));
      setScore(prev => prev + customer.orderItem.price);
      toast.success(`${customer.orderItem.name}の注文を受け付け、在庫を更新しました！`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'orders/inventory-sync');
    }
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="bg-zinc-900 text-white px-4 py-2 rounded-xl border border-zinc-700 shadow-lg">
            <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-0.5">本日の注文高</p>
            <p className="text-xl font-mono font-bold">¥{score.toLocaleString()}</p>
          </div>
          <div className="flex items-center gap-2 text-zinc-500 text-sm">
            <UserIcon size={16} />
            <span>来店中: {activeCustomers.length}名</span>
          </div>
        </div>
        <div className="bg-[#E31E24]/10 text-[#E31E24] px-4 py-2 rounded-xl border border-[#E31E24]/20 flex items-center gap-2">
          <ChefHat size={18} />
          <span className="font-serif font-medium">シミュレーション稼働中</span>
        </div>
      </div>

      <div className="flex-1 bg-zinc-100 rounded-3xl overflow-hidden relative shadow-inner border border-zinc-200">
        <Canvas shadows={{ type: THREE.PCFShadowMap }}>
          <PerspectiveCamera makeDefault position={[0, 5, 8]} fov={50} />
          <OrbitControls 
            enablePan={false} 
            maxPolarAngle={Math.PI / 2.1} 
            minDistance={5} 
            maxDistance={12} 
          />
          
          <ambientLight intensity={0.5} />
          <pointLight position={[5, 5, 5]} intensity={1} castShadow />
          <spotLight position={[-5, 5, 5]} angle={0.15} penumbra={1} intensity={1} castShadow />

          <Suspense fallback={null}>
            <Table />
            <Chef />
            {activeCustomers.map((customer) => (
              <CustomerMesh 
                key={customer.id} 
                customer={customer} 
                onOrder={handleOrderAccept} 
              />
            ))}
            
            {/* Some static sushi props */}
            <SushiPlate position={[-4.5, 0.5, 0]} color="#FFD700" />
            <SushiPlate position={[4.5, 0.5, 0]} color="#E31E24" />
            <SushiPlate position={[0, 0.5, 0.5]} color="#FFFFFF" />
            
            <Environment preset="city" />
            <gridHelper args={[20, 20, "#ddd", "#eee"]} position={[0, -1.2, 0]} />
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.21, 0]} receiveShadow>
              <planeGeometry args={[100, 100]} />
              <meshStandardMaterial color="#FDFCFB" />
            </mesh>
          </Suspense>
        </Canvas>

        {/* Overlay instructions */}
        <div className="absolute bottom-6 left-6 right-6 flex justify-between items-end pointer-events-none">
          <div className="bg-black/80 backdrop-blur-md p-4 rounded-xl border border-white/10 text-white max-w-xs pointer-events-auto">
            <h4 className="font-serif text-sm mb-1">来店シミュレーター</h4>
            <p className="text-[10px] text-zinc-400 leading-relaxed">
              お客様がカウンターに現れます。吹き出しをクリックして注文を受け取ると、管理システムの注文一覧に追加されます。
            </p>
          </div>
          <div className="flex gap-2 pointer-events-auto">
             {/* Additional game controls could go here */}
          </div>
        </div>
      </div>
    </div>
  );
}
