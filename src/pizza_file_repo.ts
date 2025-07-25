import { promises as fs } from 'fs';

const DB_FILE = './pizza_db.json';

export type PizzaStore = {
  id: string;
  name: string;
  distance_km: number;
};

export type PizzaOrder = {
  order_id: string;
  store_id: string;
  items: { sku: string; qty: number }[];
  address: string;
  status: string;
  eta_min: number;
  total_eur: number;
};

export type PizzaDb = {
  stores: PizzaStore[];
  orders: PizzaOrder[];
};

export class PizzaFileRepo {
  private db: PizzaDb = { stores: [], orders: [] };

  async loadDb() {
    try {
      const data = await fs.readFile(DB_FILE, 'utf-8');
      this.db = JSON.parse(data);
    } catch (e) {
      this.db = { stores: [], orders: [] };
    }
  }

  async saveDb() {
    await fs.writeFile(DB_FILE, JSON.stringify(this.db, null, 2), 'utf-8');
  }

  async listStores(): Promise<PizzaStore[]> {
    await this.loadDb();
    return this.db.stores;
  }

  async addStore(store: PizzaStore) {
    await this.loadDb();
    this.db.stores.push(store);
    await this.saveDb();
  }

  async placeOrder(order: PizzaOrder) {
    await this.loadDb();
    this.db.orders.push(order);
    await this.saveDb();
  }

  async listOrders(): Promise<PizzaOrder[]> {
    await this.loadDb();
    return this.db.orders;
  }

  async getOrder(order_id: string): Promise<PizzaOrder | undefined> {
    await this.loadDb();
    return this.db.orders.find(o => o.order_id === order_id);
  }

  async cancelOrder(order_id: string): Promise<boolean> {
    await this.loadDb();
    const order = this.db.orders.find(o => o.order_id === order_id);
    if (order) {
      order.status = 'Cancelled';
      await this.saveDb();
      return true;
    }
    return false;
  }
} 