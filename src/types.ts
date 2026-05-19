export type OrderStatus = 'received' | 'preparing' | 'served' | 'paid';
export type OrderType = 'eat-in' | 'takeout';
export type InventoryCategory = 'fish' | 'vegetable' | 'rice' | 'drink' | 'other';
export type MenuCategory = 'nigiri' | 'roll' | 'sashimi' | 'side' | 'drink';

export interface OrderItem {
  name: string;
  quantity: number;
  price: number;
}

export interface Order {
  id?: string;
  tableNumber: number;
  items: OrderItem[];
  status: OrderStatus;
  totalAmount: number;
  createdAt: any;
  updatedAt: any;
  customerId?: string;
  customerName?: string;
  type: OrderType;
}

export interface InventoryItem {
  id?: string;
  name: string;
  unit: string;
  quantity: number;
  minThreshold: number;
  category: InventoryCategory;
  purchasePrice?: number;
  isPrepared?: boolean;
  updatedAt: any;
}

export interface Customer {
  id?: string;
  name: string;
  phone?: string;
  allergies?: string[];
  preferences?: string;
  totalVisits: number;
  lastVisit?: any;
}

export interface MenuItem {
  id?: string;
  name: string;
  price: number;
  category: MenuCategory;
  description?: string;
  imageUrl?: string;
  ingredients?: {
    inventoryItemId: string;
    quantity: number;
  }[];
}
