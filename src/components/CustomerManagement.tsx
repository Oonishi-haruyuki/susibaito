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
import { Customer, MenuItem, Order } from '@/src/types';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { 
  UserPlus, 
  Search, 
  Phone, 
  Calendar, 
  MessageSquare,
  AlertCircle,
  MoreHorizontal,
  Plus,
  ShoppingBag
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
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

export function CustomerManagement() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [search, setSearch] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [isOrdering, setIsOrdering] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  const [newCustomer, setNewCustomer] = useState<Omit<Customer, 'id' | 'lastVisit'>>({
    name: '',
    phone: '',
    allergies: [],
    preferences: '',
    totalVisits: 0
  });

  const [takeoutOrder, setTakeoutOrder] = useState({
    menuItemId: '',
    quantity: 1
  });

  useEffect(() => {
    const q = query(collection(db, 'customers'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const customerData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customerData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'customers');
    });

    const menuQ = query(collection(db, 'menu'));
    const menuUnsubscribe = onSnapshot(menuQ, (snapshot) => {
      setMenuItems(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem)));
    });

    return () => {
      unsubscribe();
      menuUnsubscribe();
    };
  }, []);

  const handleAddCustomer = async () => {
    try {
      if (!newCustomer.name) {
        toast.error('名前を入力してください');
        return;
      }

      await addDoc(collection(db, 'customers'), {
        ...newCustomer,
        totalVisits: 0,
        lastVisit: null
      });

      setIsAdding(false);
      setNewCustomer({ name: '', phone: '', allergies: [], preferences: '', totalVisits: 0 });
      toast.success('顧客を登録しました');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'customers');
    }
  };

  const handleCreateTakeoutOrder = async () => {
    if (!selectedCustomer || !takeoutOrder.menuItemId) {
      toast.error('お客様とメニューを選択してください');
      return;
    }

    const menuItem = menuItems.find(m => m.id === takeoutOrder.menuItemId);
    if (!menuItem) return;

    try {
      const orderData: Omit<Order, 'id'> = {
        tableNumber: 0, // 0 indicates takeout
        type: 'takeout',
        status: 'received',
        customerName: selectedCustomer.name,
        items: [{
          name: menuItem.name,
          quantity: takeoutOrder.quantity,
          price: menuItem.price
        }],
        totalAmount: menuItem.price * takeoutOrder.quantity,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      await addDoc(collection(db, 'orders'), orderData);
      
      // Update customer visit count
      await updateDoc(doc(db, 'customers', selectedCustomer.id!), {
        totalVisits: (selectedCustomer.totalVisits || 0) + 1,
        lastVisit: Timestamp.now()
      });

      setIsOrdering(false);
      setSelectedCustomer(null);
      setTakeoutOrder({ menuItemId: '', quantity: 1 });
      toast.success('お持ち帰り注文を承りました');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, 'orders');
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.includes(search) || (c.phone && c.phone.includes(search))
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
          <h2 className="text-2xl font-serif">お持ち帰り・顧客管理</h2>
          <p className="text-sm text-zinc-500">主にお持ち帰りのお客様情報の管理と注文受付を行います</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <Input 
              placeholder="お名前・電話番号で検索..." 
              className="pl-10 h-11" 
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Dialog open={isAdding} onOpenChange={setIsAdding}>
            <DialogTrigger
              render={
                <Button className="h-11 bg-[#1A1A1A] hover:bg-[#333] text-white whitespace-nowrap">
                  <UserPlus size={18} className="mr-2" /> 新規登録
                </Button>
              }
            />
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">新規顧客登録 (テイクアウト用)</DialogTitle>
              </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>お名前</Label>
                <Input 
                  value={newCustomer.name}
                  onChange={(e) => setNewCustomer({...newCustomer, name: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>電話番号</Label>
                <Input 
                  value={newCustomer.phone}
                  onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                />
              </div>
              <div className="space-y-2">
                <Label>アレルギー情報</Label>
                <Input 
                  placeholder="コンマ区切りで入力 (例: エビ, カニ)"
                  value={newCustomer.allergies?.join(', ') || ''}
                  onChange={(e) => setNewCustomer({...newCustomer, allergies: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})}
                />
              </div>
              <div className="space-y-2">
                <Label>備考・好み</Label>
                <Input 
                  value={newCustomer.preferences}
                  onChange={(e) => setNewCustomer({...newCustomer, preferences: e.target.value})}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAdding(false)}>キャンセル</Button>
              <Button onClick={handleAddCustomer} className="bg-[#E31E24]">登録</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredCustomers.map((customer) => (
          <Card key={customer.id} className="border-none shadow-sm hover:shadow-md transition-shadow group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreHorizontal size={16} />
              </Button>
            </div>
            <CardHeader className="pb-3 px-6 pt-6">
              <div className="flex justify-between items-start">
                <div className="w-12 h-12 bg-zinc-100 rounded-full flex items-center justify-center font-serif text-xl border border-zinc-200">
                  {customer.name[0]}
                </div>
                <div className="text-right">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">ご利用回数</p>
                  <p className="font-serif text-2xl text-zinc-900">{customer.totalVisits || 0}回</p>
                </div>
              </div>
              <CardTitle className="mt-4 font-serif text-lg text-zinc-900">{customer.name}</CardTitle>
            </CardHeader>
            <CardContent className="px-6 pb-6 space-y-4 flex-1">
              <div className="space-y-2">
                {customer.phone && (
                  <div className="flex items-center gap-2 text-zinc-600 text-sm">
                    <Phone size={14} className="text-zinc-400" />
                    <span>{customer.phone}</span>
                  </div>
                )}
                <div className="flex items-center gap-2 text-zinc-600 text-sm">
                  <Calendar size={14} className="text-zinc-400" />
                  <span>最終来店: {customer.lastVisit ? format(customer.lastVisit.toDate(), 'yyyy/MM/dd', { locale: ja }) : 'なし'}</span>
                </div>
              </div>

              {customer.allergies && customer.allergies.length > 0 && (
                <div className="pt-2">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1 font-bold">
                    <AlertCircle size={10} className="text-red-500" /> アレルギー
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {customer.allergies.map((a, idx) => (
                      <Badge key={idx} variant="destructive" className="bg-red-50 text-red-700 border-red-100 text-[10px] h-5 rounded-sm px-1.5 font-normal">
                        {a}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {customer.preferences && (
                <div className="pt-2 bg-zinc-50 p-3 rounded-lg border border-zinc-100">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500 mb-1 flex items-center gap-1 font-bold">
                    <MessageSquare size={10} /> 備考
                  </p>
                  <p className="text-xs text-zinc-700 line-clamp-2 italic leading-relaxed">
                    "{customer.preferences}"
                  </p>
                </div>
              )}
            </CardContent>
            <div className="p-4 bg-zinc-100/50 mt-auto border-t border-zinc-100">
              <Dialog open={isOrdering && selectedCustomer?.id === customer.id} onOpenChange={(open) => {
                setIsOrdering(open);
                if (open) setSelectedCustomer(customer);
              }}>
                <DialogTrigger
                  render={
                    <Button variant="outline" className="w-full bg-white hover:bg-zinc-100 text-zinc-900 border-zinc-200">
                      <Plus size={16} className="mr-2" />
                      お持ち帰り注文を入れる
                    </Button>
                  }
                />
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle className="font-serif">テイクアウト注文受付: {customer.name}様</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-6 py-4">
                    <div className="space-y-2">
                      <Label>商品選択</Label>
                      <Select 
                        value={takeoutOrder.menuItemId} 
                        onValueChange={(val) => setTakeoutOrder({...takeoutOrder, menuItemId: val})}
                      >
                        <SelectTrigger className="h-12 text-lg">
                          <SelectValue placeholder="商品を選択" />
                        </SelectTrigger>
                        <SelectContent className="max-h-[300px]">
                          {menuItems.map(m => (
                            <SelectItem key={m.id} value={m.id!}>{m.name} (¥{m.price})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>数量</Label>
                      <Input 
                        type="number" 
                        min="1"
                        className="h-12 text-2xl font-bold text-center"
                        value={isNaN(takeoutOrder.quantity) ? "" : takeoutOrder.quantity}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          setTakeoutOrder({...takeoutOrder, quantity: isNaN(val) ? 0 : val});
                        }}
                      />
                    </div>
                    
                    {takeoutOrder.menuItemId && (
                      <div className="p-4 bg-zinc-50 rounded-xl border border-zinc-100 flex justify-between items-center">
                        <div>
                          <div className="text-[10px] text-zinc-500 uppercase tracking-widest font-bold">お支払い合計</div>
                          <div className="text-2xl font-bold text-zinc-900">
                            ¥{(menuItems.find(m => m.id === takeoutOrder.menuItemId)?.price || 0) * takeoutOrder.quantity}
                          </div>
                        </div>
                        <ShoppingBag className="text-zinc-300" size={32} />
                      </div>
                    )}
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsOrdering(false)}>戻る</Button>
                    <Button onClick={handleCreateTakeoutOrder} className="bg-[#E31E24] h-12 text-lg px-8">
                      注文を確定する
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
