import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  Timestamp,
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { InventoryItem, InventoryCategory } from '@/src/types';
import { cn } from '@/lib/utils';
import { 
  Plus, 
  AlertTriangle, 
  Search, 
  Filter,
  Trash2,
  Edit2,
  CheckCircle2,
  Package,
  ChefHat,
  Truck,
  ArrowRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  runTransaction,
  increment
} from 'firebase/firestore';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogFooter,
  DialogTrigger
} from '@/components/ui/dialog';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { toast } from 'sonner';

const CATEGORY_MAP: Record<InventoryCategory, string> = {
  fish: '鮮魚',
  vegetable: '野菜',
  rice: '米/シャリ',
  drink: '飲料',
  other: 'その他',
};

export function InventoryManagement() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [activeTab, setActiveTab] = useState('list');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState('');
  
  // Cooking state
  const [cookAmount, setCookAmount] = useState(1);
  
  // Procurement state
  const [procureItem, setProcureItem] = useState({
    id: '',
    quantity: 0
  });

  const [newItem, setNewItem] = useState<Omit<InventoryItem, 'id' | 'updatedAt'>>({
    name: '',
    unit: 'kg',
    quantity: 0,
    minThreshold: 1,
    category: 'fish'
  });

  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('category', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const inventoryData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setItems(inventoryData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
    });
    return () => unsubscribe();
  }, []);

  const handleSaveItem = async () => {
    try {
      if (!newItem.name) {
        toast.error('名前を入力してください');
        return;
      }

      const quantity = isNaN(newItem.quantity) ? 0 : newItem.quantity;
      const minThreshold = isNaN(newItem.minThreshold) ? 0 : newItem.minThreshold;

      const itemData = {
        ...newItem,
        quantity,
        minThreshold,
        updatedAt: Timestamp.now()
      };

      if (editingItem) {
        await updateDoc(doc(db, 'inventory', editingItem.id!), itemData);
        toast.success('在庫情報を更新しました');
      } else {
        await addDoc(collection(db, 'inventory'), itemData);
        toast.success('新しい在庫を追加しました');
      }

      setIsAddingItem(false);
      setEditingItem(null);
      setNewItem({ name: '', unit: 'kg', quantity: 0, minThreshold: 1, category: 'fish' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('本当に削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'inventory', id));
      toast.success('削除しました');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `inventory/${id}`);
    }
  };

  const handleProcure = async () => {
    if (!procureItem.id || procureItem.quantity <= 0) {
      toast.error('アイテムと数量を正しく入力してください');
      return;
    }

    try {
      await updateDoc(doc(db, 'inventory', procureItem.id), {
        quantity: increment(procureItem.quantity),
        updatedAt: Timestamp.now()
      });
      toast.success('食材を調達しました');
      setProcureItem({ id: '', quantity: 0 });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory/procure');
    }
  };

  const handleCookSushiRice = async () => {
    // 3:7 ratio. Total units = rice + vinegar.
    // Let's say units are kg.
    const riceNeeded = cookAmount * 0.7;
    const vinegarNeeded = cookAmount * 0.3;

    const riceItem = items.find(i => i.name === '米' || i.category === 'rice');
    const vinegarItem = items.find(i => i.name === '酢');
    let sushiRiceItem = items.find(i => i.name === '酢飯' || i.name === 'シャリ');

    if (!riceItem || riceItem.quantity < riceNeeded) {
      toast.error('米が足りません');
      return;
    }
    if (!vinegarItem || vinegarItem.quantity < vinegarNeeded) {
      toast.error('酢が足りません');
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        // Decrement ingredients
        transaction.update(doc(db, 'inventory', riceItem.id!), {
          quantity: increment(-riceNeeded),
          updatedAt: Timestamp.now()
        });
        transaction.update(doc(db, 'inventory', vinegarItem.id!), {
          quantity: increment(-vinegarNeeded),
          updatedAt: Timestamp.now()
        });

        // Increment or Create Sushi Rice
        if (sushiRiceItem) {
          transaction.update(doc(db, 'inventory', sushiRiceItem.id!), {
            quantity: increment(cookAmount),
            updatedAt: Timestamp.now()
          });
        } else {
          const newRef = doc(collection(db, 'inventory'));
          transaction.set(newRef, {
            name: '酢飯',
            unit: 'kg',
            quantity: cookAmount,
            minThreshold: 5,
            category: 'rice',
            updatedAt: Timestamp.now()
          });
        }
      });
      toast.success('酢飯を調理しました');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory/cook');
    }
  };

  const initializeStock = async () => {
    const itemsToInit = [
      { name: 'まぐろ', quantity: 100, unit: 'kg', category: 'fish' as InventoryCategory, minThreshold: 10 },
      { name: '酢', quantity: 1, unit: 'kg', category: 'other' as InventoryCategory, minThreshold: 0.5 },
      { name: '米', quantity: 30, unit: 'kg', category: 'rice' as InventoryCategory, minThreshold: 10 },
    ];

    try {
      for (const item of itemsToInit) {
        const existing = items.find(i => i.name === item.name);
        if (existing) {
          await updateDoc(doc(db, 'inventory', existing.id!), {
            quantity: increment(item.quantity),
            updatedAt: Timestamp.now()
          });
        } else {
          await addDoc(collection(db, 'inventory'), {
            ...item,
            updatedAt: Timestamp.now()
          });
        }
      }
      toast.success('初期在庫を設定しました');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory/init');
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    CATEGORY_MAP[item.category].includes(search)
  );

  const lowStockItems = items.filter(item => item.quantity <= item.minThreshold);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif">在庫・材料管理</h2>
          <p className="text-sm text-zinc-500">店舗の食材在庫と調理・調達を管理します</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={initializeStock} className="text-zinc-600 border-zinc-200">
            初期在庫をセット
          </Button>
          <Dialog open={isAddingItem} onOpenChange={(open) => {
            setIsAddingItem(open);
            if (!open) {
              setEditingItem(null);
              setNewItem({ name: '', unit: 'kg', quantity: 0, minThreshold: 1, category: 'fish' });
            }
          }}>
            <DialogTrigger
              render={
                <Button className="bg-[#1A1A1A] hover:bg-[#333] text-white">
                  <Plus size={16} className="mr-2" /> 新規アイテム
                </Button>
              }
            />
            <DialogContent className="font-sans">
              <DialogHeader>
                <DialogTitle className="font-serif">{editingItem ? '在庫の編集' : '新規在庫の登録'}</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="space-y-2">
                  <Label>名前</Label>
                  <Input 
                    placeholder="例: マグロ (赤身)" 
                    value={newItem.name}
                    onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>カテゴリ</Label>
                    <Select 
                      value={newItem.category} 
                      onValueChange={(val: InventoryCategory) => setNewItem({...newItem, category: val})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(CATEGORY_MAP).map(([val, label]) => (
                          <SelectItem key={val} value={val}>{label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>単位</Label>
                    <Select 
                      value={newItem.unit} 
                      onValueChange={(val) => setNewItem({...newItem, unit: val})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="kg">kg</SelectItem>
                        <SelectItem value="g">g</SelectItem>
                        <SelectItem value="pcs">個 (pcs)</SelectItem>
                        <SelectItem value="L">L</SelectItem>
                        <SelectItem value="ケース">ケース</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>現在庫量</Label>
                    <Input 
                      type="number" 
                      value={isNaN(newItem.quantity) ? "" : newItem.quantity}
                      onChange={(e) => setNewItem({...newItem, quantity: parseFloat(e.target.value)})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>アラート閾値</Label>
                    <Input 
                      type="number" 
                      value={isNaN(newItem.minThreshold) ? "" : newItem.minThreshold}
                      onChange={(e) => setNewItem({...newItem, minThreshold: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsAddingItem(false)}>キャンセル</Button>
                <Button onClick={handleSaveItem} className="bg-[#E31E24]">
                  {editingItem ? '更新' : '登録'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-zinc-100 p-1 h-11 w-full md:w-auto grid grid-cols-3 md:flex md:gap-1">
          <TabsTrigger value="list" className="flex gap-2 items-center text-xs md:text-sm">
            <Package size={14} /> 在庫一覧
          </TabsTrigger>
          <TabsTrigger value="procure" className="flex gap-2 items-center text-xs md:text-sm">
            <Truck size={14} /> 食材調達
          </TabsTrigger>
          <TabsTrigger value="cook" className="flex gap-2 items-center text-xs md:text-sm">
            <ChefHat size={14} /> 調理 (仕込み)
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="space-y-6 pt-4">
          <div className="flex-1 max-w-sm">
            <Label className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">検索</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <Input 
                placeholder="在庫名やカテゴリで検索..." 
                className="pl-10" 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          {lowStockItems.length > 0 && (
            <Card className="border-amber-200 bg-amber-50 shadow-none">
              <CardContent className="pt-6 flex items-start gap-4">
                <div className="bg-amber-100 p-2 rounded-full">
                  <AlertTriangle className="text-amber-600" size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-amber-900">在庫が少なくなっています</h3>
                  <p className="text-xs text-amber-700 mt-1">
                    以下の{lowStockItems.length}件のアイテムが閾値を下回っています: 
                    <span className="font-medium ml-1">
                      {lowStockItems.map(i => i.name).join(', ')}
                    </span>
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          <Card className="border-none shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-50/50 hover:bg-transparent">
                  <TableHead className="w-[150px]">カテゴリ</TableHead>
                  <TableHead>アイテム名</TableHead>
                  <TableHead>在庫量</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.map((item) => {
                  const isLow = item.quantity <= item.minThreshold;
                  return (
                    <TableRow key={item.id} className="group border-zinc-100">
                      <TableCell>
                        <Badge variant="secondary" className="font-normal bg-zinc-100 text-zinc-600 border-none">
                          {CATEGORY_MAP[item.category]}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium text-zinc-900">{item.name}</TableCell>
                      <TableCell>
                        <div className="flex items-baseline gap-1">
                          <span className={cn(
                            "text-lg font-mono",
                            isLow ? "text-[#E31E24] font-bold" : "text-zinc-900"
                          )}>
                            {item.quantity.toFixed(item.unit === 'kg' ? 2 : 0)}
                          </span>
                          <span className="text-[10px] text-zinc-500 uppercase">{item.unit}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        {isLow ? (
                          <div className="flex items-center gap-1.5 text-[#E31E24] text-xs font-semibold">
                            <AlertTriangle size={14} />
                            補充が必要
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-emerald-600 text-xs font-semibold">
                            <CheckCircle2 size={14} />
                            十分
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-zinc-400 hover:text-zinc-900"
                            onClick={() => {
                              setEditingItem(item);
                              setNewItem({
                                name: item.name,
                                unit: item.unit,
                                quantity: item.quantity,
                                minThreshold: item.minThreshold,
                                category: item.category
                              });
                              setIsAddingItem(true);
                            }}
                          >
                            <Edit2 size={14} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-zinc-400 hover:text-red-500"
                            onClick={() => handleDeleteItem(item.id!)}
                          >
                            <Trash2 size={14} />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        <TabsContent value="procure" className="pt-4">
          <div className="max-w-2xl mx-auto">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="font-serif">食材の調達</CardTitle>
                <CardDescription>取引先から届いた食材を、現在の在庫に追加します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>調達アイテム</Label>
                    <Select 
                      value={procureItem.id} 
                      onValueChange={(val) => setProcureItem({...procureItem, id: val})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="食材を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.map(i => (
                          <SelectItem key={i.id} value={i.id!}>{i.name} ({i.unit})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>調達数量</Label>
                    <Input 
                      type="number" 
                      placeholder="数量を入力"
                      value={procureItem.quantity || ''}
                      onChange={(e) => setProcureItem({...procureItem, quantity: parseFloat(e.target.value)})}
                    />
                  </div>
                </div>
                <Button onClick={handleProcure} className="w-full bg-[#1A1A1A] text-white">
                  調達確定
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cook" className="pt-4">
          <div className="max-w-2xl mx-auto">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <ChefHat size={20} />
                  酢飯 (シャリ) の仕込み
                </CardTitle>
                <CardDescription>酢と米を 3:7 の黄金比で混ぜ合わせ、酢飯を作成します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="flex items-center justify-center gap-12 py-4">
                  <div className="text-center space-y-2">
                    <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center mx-auto text-xl font-bold text-zinc-400">酢</div>
                    <div className="text-sm font-medium">3</div>
                  </div>
                  <Plus className="text-zinc-300" />
                  <div className="text-center space-y-2">
                    <div className="w-20 h-20 rounded-full bg-zinc-100 flex items-center justify-center mx-auto text-xl font-bold text-zinc-400">米</div>
                    <div className="text-sm font-medium">7</div>
                  </div>
                  <ArrowRight className="text-zinc-300" />
                  <div className="text-center space-y-2">
                    <div className="w-24 h-24 rounded-full bg-red-50 border-2 border-dashed border-red-200 flex items-center justify-center mx-auto text-xl font-bold text-red-500">シャリ</div>
                    <div className="text-sm font-medium text-red-500">10</div>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>仕込み量 (kg)</Label>
                    <Input 
                      type="number" 
                      className="text-lg h-12 text-center font-bold"
                      value={cookAmount}
                      onChange={(e) => setCookAmount(parseFloat(e.target.value))}
                    />
                    <div className="flex justify-between text-[11px] text-zinc-500 px-1 italic">
                      <span>必要材料:</span>
                      <span>酢: {(cookAmount * 0.3).toFixed(2)}kg / 米: {(cookAmount * 0.7).toFixed(2)}kg</span>
                    </div>
                  </div>
                  <Button onClick={handleCookSushiRice} className="w-full bg-[#E31E24] text-white">
                    仕込み開始
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
