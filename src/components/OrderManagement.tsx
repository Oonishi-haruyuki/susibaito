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
  runTransaction,
  increment,
  getDoc
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '@/src/lib/firebase';
import { Order, OrderStatus, OrderType, MenuItem, InventoryItem } from '@/src/types';
import { format } from 'date-fns';
import { ja } from 'date-fns/locale';
import { cn } from '@/lib/utils';
import { 
  Plus, 
  Clock, 
  CheckCircle2, 
  Utensils, 
  ShoppingBag, 
  MoreVertical,
  ChevronRight,
  TrendingUp,
  Search
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger 
} from '@/components/ui/dropdown-menu';
import { toast } from 'sonner';
import { Customer } from '@/src/types';

const STATUS_MAP: Record<OrderStatus, { label: string, color: string }> = {
  received: { label: '注文完了', color: 'bg-zinc-100 text-zinc-800' },
  preparing: { label: '調理中', color: 'bg-amber-100 text-amber-800' },
  served: { label: '提供済', color: 'bg-emerald-100 text-emerald-800' },
  paid: { label: '会計済', color: 'bg-blue-100 text-blue-800' },
};

import { LayoutGrid, List } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function OrderManagement() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeView, setActiveView] = useState<'list' | 'tables'>('list');
  const [isAddingOrder, setIsAddingOrder] = useState(false);
  const [newOrder, setNewOrder] = useState<{
    tableNumber: string;
    type: OrderType;
    items: { menuItemId: string, quantity: number }[];
  }>({
    tableNumber: '1',
    type: 'eat-in',
    items: [{ menuItemId: '', quantity: 1 }]
  });

  useEffect(() => {
    const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Order));
      setOrders(ordersData);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'orders');
    });

    const menuQ = query(collection(db, 'menu'), orderBy('name', 'asc'));
    const menuUnsubscribe = onSnapshot(menuQ, (snapshot) => {
      const menuData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as MenuItem));
      setMenuItems(menuData);
    });

    const customerQ = query(collection(db, 'customers'));
    const customerUnsubscribe = onSnapshot(customerQ, (snapshot) => {
      const customerData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customerData);
    });

    const inventoryQ = query(collection(db, 'inventory'));
    const inventoryUnsubscribe = onSnapshot(inventoryQ, (snapshot) => {
      const invData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem));
      setInventoryItems(invData);
    });

    return () => {
      unsubscribe();
      menuUnsubscribe();
      customerUnsubscribe();
      inventoryUnsubscribe();
    }
  }, []);

  const handleUpdateStatus = async (orderId: string, newStatus: OrderStatus) => {
    try {
      const orderRef = doc(db, 'orders', orderId);

      if (newStatus === 'paid') {
        const orderSnap = await getDoc(orderRef);
        if (!orderSnap.exists()) return;
        const totalAmount = orderSnap.data().totalAmount || 0;

        await runTransaction(db, async (transaction) => {
          const financeRef = doc(db, 'finances', 'main');
          
          transaction.update(orderRef, {
            status: newStatus,
            updatedAt: Timestamp.now()
          });

          transaction.update(financeRef, {
            balance: increment(totalAmount),
            updatedAt: Timestamp.now()
          });
        });
      } else {
        await updateDoc(orderRef, {
          status: newStatus,
          updatedAt: Timestamp.now()
        });
      }
      toast.success('ステータスを更新しました');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `orders/${orderId}`);
    }
  };

  const handleTableCheckout = async (tableNumber: number) => {
    try {
      const tableOrders = activeOrders.filter(o => o.tableNumber === tableNumber);
      if (tableOrders.length === 0) return;

      const totalAmount = tableOrders.reduce((acc, o) => acc + o.totalAmount, 0);

      await runTransaction(db, async (transaction) => {
        const financeRef = doc(db, 'finances', 'main');
        
        // 1. All reads first
        const orderSnapshots = [];
        for (const order of tableOrders) {
          const orderRef = doc(db, 'orders', order.id!);
          const orderSnap = await transaction.get(orderRef);
          orderSnapshots.push({ ref: orderRef, snap: orderSnap });
        }

        // 2. All writes after
        for (const { ref, snap } of orderSnapshots) {
          if (snap.exists()) {
            transaction.update(ref, {
              status: 'paid',
              updatedAt: Timestamp.now()
            });
          }
        }

        transaction.update(financeRef, {
          balance: increment(totalAmount),
          updatedAt: Timestamp.now()
        });
      });

      toast.success(`${tableNumber}番卓の会計が完了しました (合計: ¥${totalAmount.toLocaleString()})`);
    } catch (error) {
      console.error(error);
      toast.error('会計処理に失敗しました');
    }
  };

  const handleAddOrder = async () => {
    try {
      if (newOrder.items.some(i => !i.menuItemId)) {
        toast.error('メニューを選択してください');
        return;
      }

      // 1. Calculate required ingredients and check stock
      const requiredIngredients: Record<string, number> = {};
      const items = newOrder.items.map(i => {
        const menuItem = menuItems.find(m => m.id === i.menuItemId)!;
        const quantity = isNaN(i.quantity) || i.quantity < 1 ? 1 : i.quantity;
        
        // Accumulate required ingredients
        if (menuItem.ingredients) {
          menuItem.ingredients.forEach(ing => {
            const totalRequired = ing.quantity * quantity;
            requiredIngredients[ing.inventoryItemId] = (requiredIngredients[ing.inventoryItemId] || 0) + totalRequired;
          });
        }

        return {
          name: menuItem.name,
          quantity: quantity,
          price: menuItem.price
        };
      });

      // 2. Check if enough stock exists for all ingredients
      for (const [itemId, requiredQty] of Object.entries(requiredIngredients)) {
        const inventoryItem = inventoryItems.find(inv => inv.id === itemId);
        if (!inventoryItem || inventoryItem.quantity < requiredQty) {
          toast.error(`在庫不足: ${inventoryItem?.name || '不明な食材'} (残り ${inventoryItem?.quantity || 0}${inventoryItem?.unit || ''})`);
          return;
        }
      }

      const totalAmount = items.reduce((acc, i) => acc + (i.price * i.quantity), 0);
      const tableNum = parseInt(newOrder.tableNumber);
      const orderData: Omit<Order, 'id'> = {
        tableNumber: isNaN(tableNum) ? 0 : tableNum,
        type: newOrder.type,
        status: 'received',
        items,
        totalAmount,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      // 3. Perform transaction: Add Order + Decrement Inventory
      await runTransaction(db, async (transaction) => {
        // A. All reads first
        const inventorySnapshots = [];
        for (const [itemId, requiredQty] of Object.entries(requiredIngredients)) {
          const invRef = doc(db, 'inventory', itemId);
          const invSnap = await transaction.get(invRef);
          inventorySnapshots.push({ ref: invRef, snap: invSnap, requiredQty });
        }

        // B. All writes after
        const newOrderRef = doc(collection(db, 'orders'));
        transaction.set(newOrderRef, orderData);

        for (const { ref, snap, requiredQty } of inventorySnapshots) {
          if (snap.exists()) {
            transaction.update(ref, {
              quantity: increment(-requiredQty),
              updatedAt: Timestamp.now()
            });
          } else {
            console.warn(`Inventory item ${ref.id} not found. Skipping sync for this ingredient.`);
          }
        }
      });

      setIsAddingOrder(false);
      setNewOrder({ tableNumber: '1', type: 'eat-in', items: [{ menuItemId: '', quantity: 1 }] });
      toast.success('注文を追加し、在庫を更新しました');
    } catch (error) {
      console.error(error);
      handleFirestoreError(error, OperationType.CREATE, 'orders/transaction');
    }
  };

  const addOrderItemRaw = () => {
    setNewOrder(prev => ({
      ...prev,
      items: [...prev.items, { menuItemId: '', quantity: 1 }]
    }));
  };

  const updateOrderItemRaw = (index: number, menuItemId: string, quantity: number) => {
    const updatedItems = [...newOrder.items];
    updatedItems[index] = { menuItemId, quantity };
    setNewOrder(prev => ({ ...prev, items: updatedItems }));
  };

  const filteredOrders = orders.filter(order => {
    const tableMatch = order.tableNumber > 0 && order.tableNumber.toString().includes(searchTerm);
    const customerIdMatch = order.customerId && customers.find(c => c.id === order.customerId)?.name.toLowerCase().includes(searchTerm.toLowerCase());
    const customerNameMatch = order.customerName?.toLowerCase().includes(searchTerm.toLowerCase());
    
    return tableMatch || customerIdMatch || customerNameMatch;
  });

  const activeOrders = orders.filter(o => o.status !== 'paid');
  
  // Group active orders by table
  const tableSummary = activeOrders.reduce((acc, order) => {
    if (order.type === 'takeout') return acc;
    if (!acc[order.tableNumber]) {
      acc[order.tableNumber] = {
        orders: [],
        total: 0,
        unservedCount: 0
      };
    }
    acc[order.tableNumber].orders.push(order);
    acc[order.tableNumber].total += order.totalAmount;
    if (order.status !== 'served') {
      acc[order.tableNumber].unservedCount++;
    }
    return acc;
  }, {} as Record<number, { orders: Order[], total: number, unservedCount: number }>);

  const totalToday = orders
    .filter(o => {
      const date = o.createdAt?.toDate?.() || new Date();
      return format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
    })
    .reduce((acc, o) => acc + o.totalAmount, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="border-none shadow-sm bg-zinc-900 text-white">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Clock size={16} className="text-[#E31E24]" />
              稼働中の注文
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-serif">{activeOrders.length}件</div>
            <p className="text-xs text-zinc-500 mt-1">未会計の注文数</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <TrendingUp size={16} className="text-emerald-500" />
              本日の総売上
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-serif">¥{totalToday.toLocaleString()}</div>
            <p className="text-xs text-zinc-500 mt-1">集計期間: 本日</p>
          </CardContent>
        </Card>
      <div className="flex items-center justify-between">
        <Tabs value={activeView} onValueChange={(v: any) => setActiveView(v)} className="w-auto">
          <TabsList className="bg-zinc-100 p-1 rounded-xl">
            <TabsTrigger value="list" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <List size={14} className="mr-2" /> 注文詳細
            </TabsTrigger>
            <TabsTrigger value="tables" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">
              <LayoutGrid size={14} className="mr-2" /> 卓管理
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Dialog open={isAddingOrder} onOpenChange={setIsAddingOrder}>
          <DialogTrigger
            render={
              <Button className="bg-[#E31E24] hover:bg-[#C21A1F] text-white px-6 rounded-xl flex items-center gap-2">
                <Plus size={18} />
                <span className="font-serif">新規注文</span>
              </Button>
            }
          />
          <DialogContent className="max-w-2xl sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="font-serif">新規注文入力</DialogTitle>
            </DialogHeader>
            <div className="grid gap-6 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>種別</Label>
                  <Select 
                    value={newOrder.type} 
                    onValueChange={(val: OrderType) => setNewOrder({...newOrder, type: val})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="eat-in">店内 (Eat-in)</SelectItem>
                      <SelectItem value="takeout">持ち帰り (Takeout)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>卓番号 / 注文番号</Label>
                  <Input 
                    type="number" 
                    value={newOrder.tableNumber}
                    onChange={(e) => setNewOrder({...newOrder, tableNumber: e.target.value})}
                  />
                </div>
              </div>

              <div className="space-y-4">
                <Label>注文内容</Label>
                {newOrder.items.map((item, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <div className="flex-1">
                      <Select 
                        value={item.menuItemId} 
                        onValueChange={(val) => updateOrderItemRaw(index, val, item.quantity)}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="メニューを選択" />
                        </SelectTrigger>
                        <SelectContent>
                          {menuItems.map(m => (
                            <SelectItem key={m.id} value={m.id!}>{m.name} - ¥{m.price}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Input 
                      type="number" 
                      className="w-20" 
                      min="1"
                      value={isNaN(item.quantity) ? "" : item.quantity}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        updateOrderItemRaw(index, item.menuItemId, isNaN(val) ? 1 : val);
                      }}
                    />
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      className="text-zinc-400 hover:text-red-500"
                      onClick={() => {
                        const updated = newOrder.items.filter((_, i) => i !== index);
                        setNewOrder({...newOrder, items: updated});
                      }}
                    >
                      ×
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="w-full dashed border-zinc-200" onClick={addOrderItemRaw}>
                  <Plus size={14} className="mr-1" /> 追加
                </Button>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddingOrder(false)}>キャンセル</Button>
              <Button onClick={handleAddOrder} className="bg-[#E31E24]">注文確定</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>

      <div className="grid grid-cols-1 gap-6">
        <Tabs value={activeView}>
          <TabsContent value="list">
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="font-serif flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div className="flex items-center justify-between w-full md:w-auto">
                    <span>直近の注文一覧</span>
                    <div className="md:hidden flex gap-2">
                      <Badge variant="outline" className="font-sans font-normal border-zinc-200">全て</Badge>
                    </div>
                  </div>
                  
                  <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
                    <div className="relative w-full md:w-72">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                      <Input 
                        placeholder="卓番号、客名で検索..." 
                        className="pl-9 bg-zinc-50 border-zinc-200 h-9 text-sm"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                  </div>
                </CardTitle>
                <CardDescription>リアルタイムで同期されています</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent border-zinc-100">
                      <TableHead className="w-[100px]">状態</TableHead>
                      <TableHead>種別 / 卓番</TableHead>
                      <TableHead>内容</TableHead>
                      <TableHead>金額</TableHead>
                      <TableHead>時間</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="h-32 text-center text-zinc-400">
                          {searchTerm ? '一致する注文が見つかりません' : '注文がありません'}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredOrders.map((order) => (
                        <TableRow key={order.id} className="group border-zinc-100">
                          <TableCell>
                            <Badge className={cn("font-medium", STATUS_MAP[order.status].color)}>
                              {STATUS_MAP[order.status].label}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {order.type === 'eat-in' ? (
                                <>
                                  <Utensils size={14} className="text-zinc-400" />
                                  <span className="font-medium">{order.tableNumber}番卓</span>
                                </>
                              ) : (
                                <>
                                  <ShoppingBag size={14} className="text-[#E31E24]" />
                                  <div className="flex flex-col">
                                    <span className="font-medium text-[#E31E24]">お持ち帰り</span>
                                    <span className="text-[10px] text-zinc-500">{order.customerName || '店頭受付'}</span>
                                  </div>
                                </>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-[300px]">
                            <div className="flex flex-wrap gap-1">
                              {order.items.map((item, idx) => (
                                <span key={idx} className="text-xs px-1.5 py-0.5 bg-zinc-100 rounded text-zinc-600">
                                  {item.name} ×{item.quantity}
                                </span>
                              ))}
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">¥{order.totalAmount.toLocaleString()}</TableCell>
                          <TableCell className="text-xs text-zinc-500 font-mono">
                            {order.createdAt ? format(order.createdAt.toDate(), 'HH:mm', { locale: ja }) : '-'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              {order.status === 'received' && (
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  className="h-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                                  onClick={() => handleUpdateStatus(order.id!, 'served')}
                                >
                                  提供済み
                                </Button>
                              )}
                              <DropdownMenu>
                                <DropdownMenuTrigger
                                  render={
                                    <Button variant="ghost" size="icon" className="h-8 w-8 text-zinc-400 hover:text-zinc-900">
                                      <MoreVertical size={16} />
                                    </Button>
                                  }
                                />
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(order.id!, 'received')}>
                                    注文完了に戻す
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(order.id!, 'preparing')}>
                                    調理中にする
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleUpdateStatus(order.id!, 'served')}>
                                    提供済みにする
                                  </DropdownMenuItem>
                                  <DropdownMenuItem className="text-blue-600 focus:text-blue-600" onClick={() => handleUpdateStatus(order.id!, 'paid')}>
                                    会計済みにする
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="tables">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {Object.keys(tableSummary).length === 0 ? (
                <div className="col-span-full h-64 flex flex-col items-center justify-center bg-white rounded-3xl border border-dashed border-zinc-200 text-zinc-400">
                  <Utensils size={48} className="mb-4 opacity-20" />
                  <p>稼働中のテーブルはありません</p>
                </div>
              ) : (
                Object.entries(tableSummary).sort(([a], [b]) => parseInt(a) - parseInt(b)).map(([tableNum, summary]) => (
                  <Card key={tableNum} className="border-none shadow-sm overflow-hidden group hover:shadow-md transition-shadow">
                    <div className={cn(
                      "h-1.5 w-full",
                      summary.unservedCount > 0 ? "bg-amber-400" : "bg-emerald-500"
                    )} />
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <CardTitle className="font-serif text-2xl">{tableNum}番卓</CardTitle>
                        <Badge variant="outline" className={cn(
                          "font-normal",
                          summary.unservedCount > 0 ? "border-amber-200 text-amber-700 bg-amber-50" : "border-emerald-200 text-emerald-700 bg-emerald-50"
                        )}>
                          {summary.unservedCount > 0 ? `${summary.unservedCount}品未提供` : "全て提供済"}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-col gap-1">
                        {summary.orders.flatMap(o => o.items).slice(0, 3).map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs text-zinc-500">
                            <span>{item.name}</span>
                            <span>×{item.quantity}</span>
                          </div>
                        ))}
                        {summary.orders.flatMap(o => o.items).length > 3 && (
                          <p className="text-[10px] text-zinc-400">外 {summary.orders.flatMap(o => o.items).length - 3}品...</p>
                        )}
                      </div>
                      <div className="pt-2 border-t border-zinc-100 flex items-center justify-between">
                        <span className="text-sm font-medium text-zinc-500">合計金額</span>
                        <span className="text-xl font-mono font-bold">¥{summary.total.toLocaleString()}</span>
                      </div>
                      <Button 
                        className="w-full bg-[#1A1A1A] hover:bg-black text-white h-10 rounded-lg group"
                        onClick={() => handleTableCheckout(parseInt(tableNum))}
                      >
                        <CheckCircle2 size={16} className="mr-2 group-hover:scale-110 transition-transform" />
                        会計済みにする
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
