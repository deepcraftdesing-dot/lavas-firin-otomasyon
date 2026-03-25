console.log('data.js: Başlıyor...');

const SUPABASE_URL = 'https://pktxasnposdltilqufcq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrdHhhc25wb3NkbHRpbHF1ZmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTQ5NjYsImV4cCI6MjA4OTk3MDk2Nn0.53Zb6UJVo4sXLZB1Y1lmp5EeqOT8IGzYZco99l6gz3Y';

let supabase;
try {
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('data.js: Supabase bağlandı.');
    } else {
        console.error('data.js: Supabase SDK bulunamadı!');
    }
} catch (e) {
    console.error('data.js: Supabase hatası:', e);
}

const Data = {
    currentUser: null,
    isAdmin: false,

    async login(username, password) {
        console.log('data.js: Giriş denemesi:', username);
        if (username === 'admin' && password === '1234') {
            this.isAdmin = true;
            this.currentUser = { name: 'Admin', id: 'admin' };
            localStorage.setItem('lavas_auth', JSON.stringify({ role: 'admin' }));
            return true;
        }

        if (!supabase) return false;
        
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
        const auth = JSON.parse(localStorage.getItem('lavas_auth') || 'null');
        if (!auth) return false;
        if (auth.role === 'admin') {
            this.isAdmin = true;
            this.currentUser = { name: 'Admin', id: 'admin' };
            return true;
        }
        if (auth.role === 'customer' && supabase) {
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

    async getCustomers() { return (await supabase.from('customers').select('*').order('name')).data || []; },
    async getProducts() { return (await supabase.from('products').select('*').order('id')).data || []; },
    async getOrders(date) { 
        let q = supabase.from('orders').select('*');
        if(date) q = q.eq('date', date);
        return (await q).data || [];
    },
    async saveCustomer(c) {
        const { id, ...p } = c;
        if(id) return await supabase.from('customers').update(p).eq('id', id);
        return await supabase.from('customers').insert([p]);
    },
    async deleteCustomer(id) { await supabase.from('customers').delete().eq('id', id); },
    async saveOrder(o) {
        const { id, ...p } = o;
        const today = new Date().toISOString().split('T')[0];
        const exist = await supabase.from('orders').select('id').eq('customer_id', p.customer_id).eq('date', today).maybeSingle();
        if(exist.data) await supabase.from('orders').update({...p, date: today}).eq('id', exist.data.id);
        else await supabase.from('orders').insert([{...p, date: today}]);
        await this.updateTransactionFromOrder(p);
    },
    async updateTransactionFromOrder(o) {
        const today = new Date().toISOString().split('T')[0];
        let total = 0;
        o.items.forEach(i => total += i.quantity * i.price);
        const exist = await supabase.from('transactions').select('id').eq('customer_id', o.customer_id).eq('date', today).eq('ref', 'ORDER').maybeSingle();
        const payload = { customer_id: o.customer_id, date: today, type: 'DEBIT', amount: total, description: 'Sipariş', ref: 'ORDER' };
        if(exist.data) await supabase.from('transactions').update(payload).eq('id', exist.data.id);
        else await supabase.from('transactions').insert([payload]);
    },
    async getTransactions(cId) {
        let q = supabase.from('transactions').select('*').order('date', {ascending:false});
        if(cId) q = q.eq('customer_id', cId);
        return (await q).data || [];
    },
    async getCustomerBalance(cId) {
        const txs = await this.getTransactions(cId);
        return txs.reduce((acc, t) => t.type === 'DEBIT' ? acc + parseFloat(t.amount) : acc - parseFloat(t.amount), 0);
    },
    async addPayment(cId, amt, desc) {
        await supabase.from('transactions').insert([{
            customer_id: cId, date: new Date().toISOString().split('T')[0],
            type: 'CREDIT', amount: amt, description: desc || 'Tahsilat', ref: 'PAYMENT'
        }]);
    }
};

window.Data = Data;
console.log('data.js: Yüklendi.');
