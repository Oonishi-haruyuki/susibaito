import React, { useState, useEffect } from 'react';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  deleteDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { MenuItem, MenuCategory } from '@/src/types';
import { 
  Plus, 
  Search, 
  Trash2,
  Edit2,
  Image as ImageIcon
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

const CATEGORY_MAP: Record<MenuCategory, string> = {
  nigiri: '握り',
  roll: '巻き物',
  sashimi: '刺身',
  side: '一品料理',
  drink: 'お飲み物',
};

export function MenuManagement() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<MenuItem | null>(null);
  const [newItem, setNewItem] = useState<Omit<MenuItem, 'id'>>({
    name: '',
    price: 0,
    category: 'nigiri',
    description: '',
    imageUrl: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'menu'), orderBy('category', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const menuData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
      setItems(menuData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'menu');
    });
    return () => unsubscribe();
  }, []);

  const handleSaveItem = async () => {
    try {
      if (!newItem.name || isNaN(newItem.price) || newItem.price <= 0) {
        toast.error('名前と価格を正しく入力してください');
        return;
      }

      const price = isNaN(newItem.price) ? 0 : newItem.price;

      const itemData = {
        ...newItem,
        price
      };

      if (editingItem) {
        await updateDoc(doc(db, 'menu', editingItem.id!), itemData);
        toast.success('品書きを更新しました');
      } else {
        await addDoc(collection(db, 'menu'), itemData);
        toast.success('品書きに追加しました');
      }

      setIsAdding(false);
      setEditingItem(null);
      setNewItem({ name: '', price: 0, category: 'nigiri', description: '', imageUrl: '' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'menu');
    }
  };

  const handleDeleteItem = async (id: string) => {
    if (!confirm('品書きから削除しますか？')) return;
    try {
      await deleteDoc(doc(db, 'menu', id));
      toast.success('削除しました');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `menu/${id}`);
    }
  };

  const filteredItems = items.filter(i => 
    i.name.includes(search) || CATEGORY_MAP[i.category].includes(search)
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end gap-6">
        <div className="flex-1 max-w-sm">
          <Label className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1.5 block">品書き検索</Label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <Input 
              placeholder="品名で検索..." 
              className="pl-10 h-11" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <Dialog open={isAdding} onOpenChange={(open) => {
          setIsAdding(open);
          if (!open) {
            setEditingItem(null);
            setNewItem({ name: '', price: 0, category: 'nigiri', description: '', imageUrl: '' });
          }
        }}>
          <DialogTrigger
            render={
              <Button className="h-11 bg-[#1A1A1A] hover:bg-[#333] text-white">
                <Plus size={18} className="mr-2" /> 新規品目追加
              </Button>
            }
          />
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif">{editingItem ? '品目の編集' : '新規品目の登録'}</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>品名</Label>
                <Input 
                  value={newItem.name}
                  onChange={(e) => setNewItem({...newItem, name: e.target.value})}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>価格 (円)</Label>
                  <Input 
                    type="number"
                    value={isNaN(newItem.price) ? "" : newItem.price}
                    onChange={(e) => setNewItem({...newItem, price: parseInt(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>カテゴリ</Label>
                  <Select 
                    value={newItem.category} 
                    onValueChange={(val: MenuCategory) => setNewItem({...newItem, category: val})}
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
              </div>
              <div className="space-y-2">
                <Label>説明</Label>
                <Input 
                  value={newItem.description}
                  onChange={(e) => setNewItem({...newItem, description: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>画像URL</Label>
                <Input 
                  placeholder="https://..."
                  value={newItem.imageUrl}
                  onChange={(e) => setNewItem({...newItem, imageUrl: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAdding(false)}>キャンセル</Button>
              <Button onClick={handleSaveItem} className="bg-[#E31E24]">決定</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {filteredItems.map((item) => (
          <Card key={item.id} className="border-none shadow-sm group overflow-hidden bg-white">
            <div className="aspect-square bg-zinc-100 flex items-center justify-center relative border-b border-zinc-50 overflow-hidden">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              ) : (
                <ImageIcon className="text-zinc-300" size={32} />
              )}
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="h-7 w-7 bg-white/90 backdrop-blur shadow-sm hover:text-[#E31E24]"
                  onClick={() => {
                    setEditingItem(item);
                    setNewItem({
                      name: item.name,
                      price: item.price,
                      category: item.category,
                      description: item.description || '',
                      imageUrl: item.imageUrl || ''
                    });
                    setIsAdding(true);
                  }}
                >
                  <Edit2 size={12} />
                </Button>
                <Button 
                  variant="secondary" 
                  size="icon" 
                  className="h-7 w-7 bg-white/90 backdrop-blur shadow-sm hover:text-red-500"
                  onClick={() => handleDeleteItem(item.id!)}
                >
                  <Trash2 size={12} />
                </Button>
              </div>
              <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/50 backdrop-blur-sm rounded text-white text-[10px] font-sans">
                {CATEGORY_MAP[item.category]}
              </div>
            </div>
            <CardContent className="p-3 bg-white">
              <h3 className="font-serif text-sm font-medium text-zinc-900 group-hover:text-[#E31E24] transition-colors">{item.name}</h3>
              <p className="font-mono text-sm font-semibold mt-1">¥{item.price.toLocaleString()}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
