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
  CheckCircle2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [search, setSearch] = useState('');
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

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(search.toLowerCase()) || 
    CATEGORY_MAP[item.category].includes(search)
  );

  const lowStockItems = items.filter(item => item.quantity <= item.minThreshold);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end gap-6">
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
        <div className="flex gap-3">
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
                  <Plus size={16} className="mr-2" /> 在庫を追加
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
                        {item.quantity}
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
    </div>
  );
}
