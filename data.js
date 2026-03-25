// Supabase Configuration
const SUPABASE_URL = 'https://pktxasnposdltilqufcq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrdHhhc25wb3NkbHRpbHF1ZmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTQ5NjYsImV4cCI6MjA4OTk3MDk2Nn0.53Zb6UJVo4sXLZB1Y1lmp5EeqOT8IGzYZco99l6gz3Y';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const Data = {
    // Current User State
    currentUser: null,
    isAdmin: false,

    async getCustomers() {
        const { data, error } = await supabase.from('customers').select('*').order('name');
        if (error) console.error('Error fetching customers:', error);
        return data || [];
    },

    async saveCustomer(customer) {
        const { id, ...payload } = customer;
        let result;
        if (id) {
            result = await supabase.from('customers').update(payload).eq('id', id);
        } else {
            result = await supabase.from('customers').insert([payload]);
        }
        if (result.error) console.error('Error saving customer:', result.error);
        return result.data;
    },

    async deleteCustomer(id) {
        const { error } = await supabase.from('customers').delete().eq('id', id);
        if (error) console.error('Error deleting customer:', error);
    },

    async getProducts() {
        const { data, error } = await supabase.from('products').select('*').order('id');
        if (error) console.error('Error fetching products:', error);
        return data || [];
    },

    async getOrders(date) {
        let query = supabase.from('orders').select('*');
        if (date) query = query.eq('date', date);
        const { data, error } = await query;
        if (error) console.error('Error fetching orders:', error);
        return data || [];
    },

    async saveOrder(order) {
        const { id, ...payload } = order;
        let result;
        const todayStr = new Date().toISOString().split('T')[0];
        
        // Find existing order for this customer today
        const existing = await supabase.from('orders')
            .select('id')
            .eq('customer_id', payload.customer_id)
            .eq('date', todayStr)
            .maybeSingle();

        if (existing.data) {
            result = await supabase.from('orders').update({ ...payload, date: todayStr }).eq('id', existing.data.id);
        } else {
            result = await supabase.from('orders').insert([{ ...payload, date: todayStr }]);
        }

        if (result.error) console.error('Error saving order:', result.error);
        
        // Update Transactions
        await this.updateTransactionFromOrder(payload);
        return result.data;
    },

    async updateTransactionFromOrder(order) {
        const todayStr = new Date().toISOString().split('T')[0];
        let total = 0;
        order.items.forEach(item => total += item.quantity * item.price);

        const existing = await supabase.from('transactions')
            .select('id')
            .eq('customer_id', order.customer_id)
            .eq('date', todayStr)
            .eq('ref', 'ORDER')
            .maybeSingle();

        const payload = {
            customer_id: order.customer_id,
            date: todayStr,
            type: 'DEBIT',
            amount: total,
            description: 'Günlük Lavaş Siparişi',
            ref: 'ORDER'
        };

        if (existing.data) {
            await supabase.from('transactions').update(payload).eq('id', existing.data.id);
        } else {
            await supabase.from('transactions').insert([payload]);
        }
    },

    async getTransactions(customerId) {
        let query = supabase.from('transactions').select('*').order('date', { ascending: false });
        if (customerId) query = query.eq('customer_id', customerId);
        const { data, error } = await query;
        if (error) console.error('Error fetching transactions:', error);
        return data || [];
    },

    async getCustomerBalance(customerId) {
        const txs = await this.getTransactions(customerId);
        return txs.reduce((acc, t) => t.type === 'DEBIT' ? acc + parseFloat(t.amount) : acc - parseFloat(t.amount), 0);
    },

    // Simple Authentication
    async login(username, password) {
        // Admin hardcoded
        if (username === 'admin' && password === '1234') {
            this.isAdmin = true;
            this.currentUser = { name: 'Admin', id: 'admin' };
            localStorage.setItem('lavas_auth', JSON.stringify({ role: 'admin' }));
            return true;
        }

        // Check customer
        const { data, error } = await supabase.from('customers')
            .select('*')
            .eq('phone', username)
            .eq('password', password)
            .maybeSingle();

        if (data) {
            this.isAdmin = false;
            this.currentUser = data;
            localStorage.setItem('lavas_auth', JSON.stringify({ role: 'customer', id: data.id }));
            return true;
        }
        return false;
    },

    async checkAuth() {
        const auth = JSON.parse(localStorage.getItem('lavas_auth'));
        if (!auth) return false;

        if (auth.role === 'admin') {
            this.isAdmin = true;
            this.currentUser = { name: 'Admin', id: 'admin' };
            return true;
        } else if (auth.role === 'customer') {
            const { data } = await supabase.from('customers').select('*').eq('id', auth.id).maybeSingle();
            if (data) {
                this.isAdmin = false;
                this.currentUser = data;
                return true;
            }
        }
        return false;
    },

    logout() {
        this.currentUser = null;
        this.isAdmin = false;
        localStorage.removeItem('lavas_auth');
    },

    async addPayment(customerId, amount, description) {
        const payload = {
            customer_id: customerId,
            date: new Date().toISOString().split('T')[0],
            type: 'CREDIT',
            amount: amount,
            description: description || 'Tahsilat',
            ref: 'PAYMENT'
        };
        const { error } = await supabase.from('transactions').insert([payload]);
        if (error) console.error('Error adding payment:', error);
    }
};
