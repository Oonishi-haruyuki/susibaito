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
import { InventoryItem, InventoryCategory, MenuItem } from '@/src/types';
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
  ArrowRight,
  ArrowUp,
  ArrowDown,
  DollarSign
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
  increment,
  getDoc,
  setDoc
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
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [balance, setBalance] = useState<number>(0);
  const [activeTab, setActiveTab] = useState('list');
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState('');
  
  // Cooking state
  const [recipeType, setRecipeType] = useState<'sushi-rice' | 'menu-item'>('sushi-rice');
  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [cookAmount, setCookAmount] = useState(1);
  
  // Market Prices
  const [marketFactor, setMarketFactor] = useState(1);
  
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
    category: 'fish',
    purchasePrice: 0
  });

  useEffect(() => {
    // Calculate daily market factor (based on date)
    const today = new Date();
    const dateStr = today.getFullYear().toString() + today.getMonth().toString() + today.getDate().toString();
    const seed = parseInt(dateStr);
    const random = (Math.sin(seed) + 1) / 2; // Value between 0 and 1
    const factor = 0.8 + (random * 0.4); // 0.8 to 1.2
    setMarketFactor(factor);

    const q = query(collection(db, 'inventory'), orderBy('category', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const inventoryData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setItems(inventoryData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'inventory');
    });

    const menuQ = query(collection(db, 'menu'));
    const menuUnsubscribe = onSnapshot(menuQ, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
      setMenuItems(data);
    });

    const financeUnsubscribe = onSnapshot(doc(db, 'finances', 'main'), (snap) => {
      if (snap.exists()) {
        setBalance(snap.data().balance || 0);
      } else {
        setBalance(0);
      }
    });

    return () => {
      unsubscribe();
      menuUnsubscribe();
      financeUnsubscribe();
    };
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
      setNewItem({ name: '', unit: 'kg', quantity: 0, minThreshold: 1, category: 'fish', purchasePrice: 0 });
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

    const item = items.find(i => i.id === procureItem.id);
    const basePrice = item?.purchasePrice || 1000;
    const currentPrice = Math.round(basePrice * marketFactor);
    const cost = currentPrice * procureItem.quantity;

    if (balance < cost) {
      toast.error(`予算が足りません (必要: ¥${cost.toLocaleString()} / 残高: ¥${balance.toLocaleString()})`);
      return;
    }

    try {
      await runTransaction(db, async (transaction) => {
        const itemRef = doc(db, 'inventory', procureItem.id);
        const financeRef = doc(db, 'finances', 'main');

        transaction.update(itemRef, {
          quantity: increment(procureItem.quantity),
          updatedAt: Timestamp.now()
        });

        transaction.update(financeRef, {
          balance: increment(-cost),
          updatedAt: Timestamp.now()
        });
      });

      toast.success(`${item?.name} を ${procureItem.quantity}${item?.unit} 仕入れました (単価: ¥${currentPrice.toLocaleString()}, 合計支出: ¥${cost.toLocaleString()})`);
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
            purchasePrice: 0,
            updatedAt: Timestamp.now()
          });
        }
      });
      toast.success('酢飯を調理しました');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory/cook');
    }
  };

  const handleCook = async () => {
    if (recipeType === 'sushi-rice') {
      return handleCookSushiRice();
    }

    const menuItem = menuItems.find(m => m.id === selectedMenuItemId);
    if (!menuItem || !menuItem.ingredients) {
      toast.error('有効なメニュー品目を選択してください');
      return;
    }

    // Check availability
    const required: Record<string, number> = {};
    for (const ing of menuItem.ingredients) {
      const needed = ing.quantity * cookAmount;
      const inv = items.find(i => i.id === ing.inventoryItemId);
      if (!inv || inv.quantity < needed) {
        toast.error(`${inv?.name || '不明な食材'}が足りません`);
        return;
      }
      required[ing.inventoryItemId] = needed;
    }

    try {
      await runTransaction(db, async (transaction) => {
        // Deduct ingredients
        for (const [id, qty] of Object.entries(required)) {
          transaction.update(doc(db, 'inventory', id), {
            quantity: increment(-qty),
            updatedAt: Timestamp.now()
          });
        }

        // Add to "Prepared" item
        const preparedName = `${menuItem.name} (仕込み済)`;
        let preparedItem = items.find(i => i.name === preparedName);

        if (preparedItem) {
          transaction.update(doc(db, 'inventory', preparedItem.id!), {
            quantity: increment(cookAmount),
            updatedAt: Timestamp.now()
          });
        } else {
          const newRef = doc(collection(db, 'inventory'));
          transaction.set(newRef, {
            name: preparedName,
            unit: 'pcs',
            quantity: cookAmount,
            minThreshold: 0,
            category: 'other',
            updatedAt: Timestamp.now()
          });
        }
      });
      toast.success(`${menuItem.name} を ${cookAmount} 個仕込みました`);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory/cook-menu');
    }
  };

  const initializeStock = async () => {
    const itemsToInit = [
      { name: 'まぐろ', quantity: 0, unit: 'kg', category: 'fish' as InventoryCategory, minThreshold: 10, purchasePrice: 3000 },
      { name: 'サーモン', quantity: 0, unit: 'kg', category: 'fish' as InventoryCategory, minThreshold: 10, purchasePrice: 2000 },
      { name: 'いくら', quantity: 0, unit: 'kg', category: 'fish' as InventoryCategory, minThreshold: 5, purchasePrice: 5000 },
      { name: '海老', quantity: 0, unit: 'kg', category: 'fish' as InventoryCategory, minThreshold: 5, purchasePrice: 1500 },
      { name: '大葉', quantity: 0, unit: 'pcs', category: 'vegetable' as InventoryCategory, minThreshold: 20, purchasePrice: 10 },
      { name: '胡瓜', quantity: 0, unit: 'pcs', category: 'vegetable' as InventoryCategory, minThreshold: 10, purchasePrice: 50 },
      { name: '酢', quantity: 0, unit: 'kg', category: 'other' as InventoryCategory, minThreshold: 0.5, purchasePrice: 500 },
      { name: '米', quantity: 0, unit: 'kg', category: 'rice' as InventoryCategory, minThreshold: 10, purchasePrice: 400 },
    ];

    try {
      // Init budget
      const financeRef = doc(db, 'finances', 'main');
      const financeSnap = await getDoc(financeRef);
      if (!financeSnap.exists()) {
        await setDoc(financeRef, {
          balance: 500000,
          updatedAt: Timestamp.now()
        });
      }

      for (const item of itemsToInit) {
        const existing = items.find(i => i.name === item.name);
        if (!existing) {
          await addDoc(collection(db, 'inventory'), {
            ...item,
            updatedAt: Timestamp.now()
          });
        }
      }
      toast.success('基本マスター品目を登録しました。数量は「食材調達」から追加してください。');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory/init');
    }
  };

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    CATEGORY_MAP[item.category].includes(search)
  );

  const lowStockItems = items.filter(item => item.quantity <= item.minThreshold);
  const uniqueLowStockNames = Array.from(new Set(lowStockItems.map(i => i.name)));

  // Detect duplicate names in the entire inventory
  const duplicateGroups = items.reduce((acc, item) => {
    if (!acc[item.name]) acc[item.name] = [];
    acc[item.name].push(item);
    return acc;
  }, {} as Record<string, InventoryItem[]>);

  const duplicateNames = Object.keys(duplicateGroups).filter(name => duplicateGroups[name].length > 1);

  const handleCleanupDuplicates = async () => {
    if (!confirm(`名前が重複しているアイテムが ${duplicateNames.length} 件あります。数量を合算して1つに統合しますか？`)) return;
    
    try {
      for (const name of duplicateNames) {
        const group = duplicateGroups[name];
        // Sort by updatedAt or assume the first one is the "main" one
        const [mainItem, ...others] = group;
        const totalQuantity = group.reduce((sum, item) => sum + item.quantity, 0);

        // Update the main item with total quantity
        await updateDoc(doc(db, 'inventory', mainItem.id!), {
          quantity: totalQuantity,
          updatedAt: Timestamp.now()
        });

        // Delete the others
        for (const other of others) {
          await deleteDoc(doc(db, 'inventory', other.id!));
        }
      }
      toast.success('重複データを統合・削除しました');
    } catch (error) {
      console.error(error);
      toast.error('重複データの削除に失敗しました');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-serif">在庫・材料管理</h2>
          <p className="text-sm text-zinc-500">店舗の食材在庫と調理・仕入れを管理します</p>
        </div>
        <div className="flex items-center gap-6">
          <div className="bg-white/50 backdrop-blur-sm border border-zinc-200 px-4 py-2 rounded-xl flex items-center gap-3">
            <div className="bg-emerald-100 p-1.5 rounded-full text-emerald-600">
              <DollarSign size={16} />
            </div>
            <div>
              <div className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold">現在予算 (残高)</div>
              <div className="text-lg font-bold text-zinc-900 leading-none">¥{balance.toLocaleString()}</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={initializeStock} className="text-zinc-600 border-zinc-200">
              基本品目・初期予算を準備
            </Button>
            <Dialog open={isAddingItem} onOpenChange={(open) => {
              setIsAddingItem(open);
              if (!open) {
                setEditingItem(null);
                setNewItem({ name: '', unit: 'kg', quantity: 0, minThreshold: 1, category: 'fish', purchasePrice: 0 });
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
                        <SelectItem value="枚">枚</SelectItem>
                        <SelectItem value="ケース">ケース</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {!editingItem && (
                  <div className="grid grid-cols-2 gap-4 p-4 bg-zinc-50 rounded-lg border border-dashed border-zinc-200">
                    <div className="space-y-2">
                      <Label className="text-zinc-500">初期在庫量</Label>
                      <Input 
                        type="number" 
                        placeholder="0"
                        value={isNaN(newItem.quantity) ? "" : newItem.quantity}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setNewItem({...newItem, quantity: isNaN(val) ? 0 : val});
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label className="text-zinc-500">基準単価 (¥)</Label>
                      <Input 
                        type="number" 
                        placeholder="市場の平均価格"
                        value={isNaN(newItem.purchasePrice || 0) ? "" : (newItem.purchasePrice || 0)}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setNewItem({...newItem, purchasePrice: isNaN(val) ? 0 : val});
                        }}
                      />
                    </div>
                    <p className="col-span-2 text-[10px] text-zinc-400">※在庫の追加や仕入れは「食材調達」タブから行ってください</p>
                  </div>
                )}

                {editingItem && (
                  <div className="space-y-2">
                    <Label>基準単価 (市場相場の基準となる価格)</Label>
                    <Input 
                      type="number" 
                      value={isNaN(newItem.purchasePrice || 0) ? "" : (newItem.purchasePrice || 0)}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setNewItem({...newItem, purchasePrice: isNaN(val) ? 0 : val});
                      }}
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label>アラート閾値 (この残量を下回ると警告)</Label>
                  <Input 
                    type="number" 
                    value={isNaN(newItem.minThreshold) ? "" : newItem.minThreshold}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      setNewItem({...newItem, minThreshold: isNaN(val) ? 0 : val});
                    }}
                  />
                </div>
              </div>
              <DialogFooter className="flex flex-col sm:flex-row justify-between items-center w-full gap-2">
                <div className="w-full sm:w-auto">
                  {editingItem && (
                    <Button 
                      variant="destructive" 
                      onClick={() => {
                        handleDeleteItem(editingItem.id!);
                        setIsAddingItem(false);
                      }}
                      className="w-full sm:w-auto bg-red-600 hover:bg-red-700 text-white"
                    >
                      <Trash2 size={14} className="mr-2" />
                      このアイテムを削除
                    </Button>
                  )}
                </div>
                <div className="flex gap-2 w-full sm:w-auto justify-end">
                  <Button variant="outline" onClick={() => setIsAddingItem(false)} className="flex-1 sm:flex-none">キャンセル</Button>
                  <Button onClick={handleSaveItem} className="bg-[#E31E24] flex-1 sm:flex-none">
                    {editingItem ? '更新' : '登録'}
                  </Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
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
          <div className="flex flex-col md:flex-row gap-4 items-start md:items-end justify-between">
            <div className="flex-1 w-full max-w-sm">
              <Label className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">検索</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <Input 
                  placeholder="在庫名やカテゴリで検索..." 
                  className="pl-10 h-10" 
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            <div className="flex items-center gap-2 bg-zinc-50 border border-zinc-100 px-3 py-2 rounded-lg">
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold">本日の相場</div>
              <div className={cn(
                "font-mono text-sm font-bold flex items-center gap-1",
                marketFactor > 1 ? "text-red-500" : "text-emerald-500"
              )}>
                {marketFactor > 1 ? <ArrowUp size={12} /> : <ArrowDown size={12} />}
                {(marketFactor * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          { (lowStockItems.length > 0 || duplicateNames.length > 0) && (
            <Card className={cn(
              "border-none shadow-none",
              duplicateNames.length > 0 ? "bg-red-50" : "bg-amber-50"
            )}>
              <CardContent className="pt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={cn(
                    "p-2 rounded-full",
                    duplicateNames.length > 0 ? "bg-red-100 text-red-600" : "bg-amber-100 text-amber-600"
                  )}>
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <h3 className={cn(
                      "text-sm font-semibold",
                      duplicateNames.length > 0 ? "text-red-900" : "text-amber-900"
                    )}>
                      {duplicateNames.length > 0 ? 'データの重複が発生しています' : '在庫が少なくなっています'}
                    </h3>
                    <p className={cn(
                      "text-xs mt-1",
                      duplicateNames.length > 0 ? "text-red-700" : "text-amber-700"
                    )}>
                      {duplicateNames.length > 0 ? (
                        <>
                          以下のアイテムが重複しています: <b>{duplicateNames.join(', ')}</b>。
                          データ不整合を防ぐため、統合してください。
                        </>
                      ) : (
                        <>
                          以下の{uniqueLowStockNames.length}点のアイテムが閾値を下回っています: 
                          <span className="font-medium ml-1">
                            {uniqueLowStockNames.join(', ')}
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                {duplicateNames.length > 0 && (
                  <Button 
                    onClick={handleCleanupDuplicates}
                    className="bg-red-600 hover:bg-red-700 text-white gap-2 shrink-0"
                  >
                    <Trash2 size={16} />
                    重複を削除して整理する
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-none shadow-sm overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-zinc-50/50 hover:bg-transparent text-[11px] uppercase tracking-wider">
                  <TableHead className="w-[120px]">カテゴリ</TableHead>
                  <TableHead>アイテム名</TableHead>
                  <TableHead>現在庫</TableHead>
                  <TableHead>本日相場 (単価)</TableHead>
                  <TableHead>状態</TableHead>
                  <TableHead className="text-right whitespace-nowrap">操作</TableHead>
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
                      <TableCell className="font-mono text-zinc-600">
                        {item.purchasePrice ? (
                          <div className="flex flex-col">
                            <span className={cn(
                              "font-bold",
                              marketFactor > 1 ? "text-red-600" : marketFactor < 1 ? "text-emerald-600" : "text-zinc-900"
                            )}>
                              ¥{Math.round(item.purchasePrice * marketFactor).toLocaleString()}
                            </span>
                            <span className="text-[10px] text-zinc-400">参考: ¥{item.purchasePrice.toLocaleString()}</span>
                          </div>
                        ) : '-'}
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
                        <div className="flex justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-zinc-400 hover:text-zinc-900 group/edit"
                            onClick={() => {
                              setEditingItem(item);
                              setNewItem({
                                name: item.name,
                                unit: item.unit,
                                quantity: item.quantity,
                                minThreshold: item.minThreshold,
                                category: item.category,
                                purchasePrice: item.purchasePrice || 0
                              });
                              setIsAddingItem(true);
                            }}
                          >
                            <Edit2 size={14} className="group-hover/edit:scale-110 transition-transform" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-zinc-400 hover:text-red-600 hover:bg-red-50 group/delete"
                            onClick={() => handleDeleteItem(item.id!)}
                          >
                            <Trash2 size={14} className="group-hover/delete:scale-110 transition-transform" />
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
                <CardTitle className="font-serif flex items-center gap-2">
                  <Truck size={20} />
                  食材の購入・仕入れ
                </CardTitle>
                <CardDescription>必要な材料を市場や取引先から購入します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label>購入アイテム</Label>
                    <Select 
                      value={procureItem.id} 
                      onValueChange={(val) => setProcureItem({...procureItem, id: val})}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="食材を選択" />
                      </SelectTrigger>
                      <SelectContent>
                        {items.filter(i => i.purchasePrice !== undefined).map(i => {
                          const currentPrice = Math.round((i.purchasePrice || 0) * marketFactor);
                          return (
                            <SelectItem key={i.id} value={i.id!}>
                              {i.name} (相場: ¥{currentPrice.toLocaleString()}/{i.unit})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>購入数量 ({items.find(i => i.id === procureItem.id)?.unit || '-'})</Label>
                    <Input 
                      type="number" 
                      placeholder="数量を入力"
                      value={isNaN(procureItem.quantity) || procureItem.quantity === 0 ? '' : procureItem.quantity}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        setProcureItem({...procureItem, quantity: isNaN(val) ? 0 : val});
                      }}
                    />
                  </div>
                </div>

                {procureItem.id && procureItem.quantity > 0 && (
                  <div className="p-4 bg-zinc-50 rounded-lg border border-zinc-100 flex justify-between items-center">
                    <div>
                      <div className="text-xs text-zinc-500 uppercase tracking-wider font-semibold">見積合計</div>
                      <div className="text-2xl font-bold text-zinc-900">
                        ¥{Math.round(((items.find(i => i.id === procureItem.id)?.purchasePrice || 0) * marketFactor) * procureItem.quantity).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-right text-sm text-zinc-500 italic">
                      本日単価 ¥{Math.round((items.find(i => i.id === procureItem.id)?.purchasePrice || 0) * marketFactor).toLocaleString()} × {procureItem.quantity}
                    </div>
                  </div>
                )}

                <Button onClick={handleProcure} className="w-full bg-[#1A1A1A] text-white h-12 text-lg">
                  購入を確定する
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="cook" className="pt-4">
          <div className="max-w-2xl mx-auto space-y-6">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="font-serif flex items-center gap-2">
                  <ChefHat size={20} />
                  仕込み・調理
                </CardTitle>
                <CardDescription>材料を消費して、半製品や完成品を作成します</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>仕込み内容</Label>
                    <Select value={recipeType} onValueChange={(val: any) => setRecipeType(val)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="sushi-rice">酢飯 (シャリ) の仕込み</SelectItem>
                        <SelectItem value="menu-item">寿司を握る・調理</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {recipeType === 'menu-item' && (
                    <div className="space-y-2">
                      <Label>品目選択</Label>
                      <Select value={selectedMenuItemId} onValueChange={setSelectedMenuItemId}>
                        <SelectTrigger>
                          <SelectValue placeholder="メニューを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {menuItems.filter(m => m.ingredients && m.ingredients.length > 0).map(m => (
                            <SelectItem key={m.id} value={m.id!}>{m.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>

                {recipeType === 'sushi-rice' ? (
                  <div className="bg-zinc-50 rounded-lg p-6">
                    <div className="flex items-center justify-center gap-12 py-4">
                      <div className="text-center space-y-2">
                        <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto text-lg font-bold text-zinc-400">酢</div>
                        <div className="text-xs font-medium">3割</div>
                      </div>
                      <Plus className="text-zinc-300" size={16} />
                      <div className="text-center space-y-2">
                        <div className="w-16 h-16 rounded-full bg-white shadow-sm flex items-center justify-center mx-auto text-lg font-bold text-zinc-400">米</div>
                        <div className="text-xs font-medium">7割</div>
                      </div>
                    </div>
                    <div className="mt-4 space-y-4">
                      <div className="space-y-2">
                        <Label>仕込み量 (kg)</Label>
                        <Input 
                          type="number" 
                          className="h-10 text-center font-bold"
                          value={isNaN(cookAmount) ? "" : cookAmount}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value);
                            setCookAmount(isNaN(val) ? 0 : val);
                          }}
                        />
                        <div className="flex justify-between text-[10px] text-zinc-500 italic px-1">
                          <span>必要: 酢 {(isNaN(cookAmount) ? 0 : cookAmount * 0.3).toFixed(2)}kg</span>
                          <span>米 {(isNaN(cookAmount) ? 0 : cookAmount * 0.7).toFixed(2)}kg</span>
                        </div>
                      </div>
                      <Button onClick={handleCookSushiRice} className="w-full bg-[#E31E24] text-white">
                        酢飯を仕込む
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="bg-zinc-50 rounded-lg p-6">
                    {selectedMenuItemId ? (
                        <div className="space-y-4">
                          <div className="space-y-2">
                            <Label>作成数量 (貫/皿)</Label>
                            <Input 
                              type="number" 
                              className="h-10 text-center font-bold"
                              value={isNaN(cookAmount) ? "" : cookAmount}
                              onChange={(e) => {
                                const val = parseFloat(e.target.value);
                                setCookAmount(isNaN(val) ? 0 : val);
                              }}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-[10px] text-zinc-500 uppercase tracking-wider">必要材料 (レシピ通り)</Label>
                            <div className="grid grid-cols-2 gap-2">
                              {menuItems.find(m => m.id === selectedMenuItemId)?.ingredients?.map(ing => {
                                const inv = items.find(i => i.id === ing.inventoryItemId);
                                return (
                                  <div key={ing.inventoryItemId} className="bg-white p-2 rounded border border-zinc-100 text-xs flex justify-between items-center">
                                    <span className="text-zinc-600 truncate mr-2">{inv?.name || '不明'}</span>
                                    <span className="font-mono flex-shrink-0 text-zinc-400">{(ing.quantity * cookAmount).toFixed(2)}{inv?.unit}</span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                          <Button onClick={handleCook} className="w-full bg-[#E31E24] text-white py-6">
                            <Plus size={18} className="mr-2" />
                            {menuItems.find(m => m.id === selectedMenuItemId)?.name} を握る
                          </Button>
                        </div>
                    ) : (
                      <div className="h-32 flex items-center justify-center text-zinc-400 italic text-sm">
                        メニューを選択してください
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
