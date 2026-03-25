// Data Management Layer
const Storage = {
    get: (key) => JSON.parse(localStorage.getItem(`lavas_firin_${key}`)) || [],
    set: (key, data) => localStorage.setItem(`lavas_firin_${key}`, JSON.stringify(data)),
    
    // Seed default data if empty
    seed: () => {
        if (Storage.get('products').length === 0) {
            Storage.set('products', [
                { id: 1, name: 'Normal Lavaş', defaultPrice: 5.0 },
                { id: 2, name: 'Tam Buğday Lavaş', defaultPrice: 6.5 },
                { id: 3, name: 'Kepekli Lavaş', defaultPrice: 6.0 },
                { id: 4, name: 'Çörek Otlu Lavaş', defaultPrice: 7.0 },
                { id: 5, name: 'Susamlı Lavaş', defaultPrice: 7.0 },
                { id: 6, name: 'Küçük Lavaş', defaultPrice: 3.5 },
                { id: 7, name: 'Dürüm Lavaş', defaultPrice: 5.5 }
            ]);
        }
    }
};

const Data = {
    getCustomers: () => Storage.get('customers'),
    saveCustomer: (customer) => {
        const customers = Storage.get('customers');
        const index = customers.findIndex(c => c.id === customer.id);
        if (index > -1) customers[index] = customer;
        else customers.push({ ...customer, id: Date.now() });
        Storage.set('customers', customers);
    },
    deleteCustomer: (id) => {
        const customers = Storage.get('customers').filter(c => c.id !== id);
        Storage.set('customers', customers);
    },

    getProducts: () => Storage.get('products'),
    saveProduct: (product) => {
        const products = Storage.get('products');
        const index = products.findIndex(p => p.id === product.id);
        if (index > -1) products[index] = product;
        else products.push({ ...product, id: Date.now() });
        Storage.set('products', products);
    },

    getOrders: () => Storage.get('orders'),
    saveOrder: (order) => {
        const orders = Storage.get('orders');
        // Check if there is already an order for this customer today
        const todayStr = new Date().toISOString().split('T')[0];
        const existingIdx = orders.findIndex(o => o.customerId === order.customerId && o.date === todayStr);
        
        if (existingIdx > -1) orders[existingIdx] = { ...order, date: todayStr };
        else orders.push({ ...order, id: Date.now(), date: todayStr });
        
        Storage.set('orders', orders);
        
        // After order, update Cari (Transaction)
        Data.updateCariFromOrder(order);
    },
    
    updateCariFromOrder: (order) => {
        const transactions = Storage.get('transactions');
        const todayStr = new Date().toISOString().split('T')[0];
        
        // Calculate total amount
        let total = 0;
        order.items.forEach(item => {
            total += item.quantity * item.price;
        });
        
        // Unified transaction per day/customer for orders
        const existingIdx = transactions.findIndex(t => 
            t.customerId === order.customerId && 
            t.date === todayStr && 
            t.type === 'DEBIT' && 
            t.ref === 'ORDER'
        );
        
        const transaction = {
            id: existingIdx > -1 ? transactions[existingIdx].id : Date.now(),
            date: todayStr,
            customerId: order.customerId,
            type: 'DEBIT',
            amount: total,
            description: 'Günlük Lavaş Siparişi',
            ref: 'ORDER'
        };
        
        if (existingIdx > -1) transactions[existingIdx] = transaction;
        else transactions.push(transaction);
        
        Storage.set('transactions', transactions);
    },

    getTransactions: () => Storage.get('transactions'),
    
    getCustomerBalance: (customerId) => {
        const txs = Storage.get('transactions').filter(t => t.customerId === customerId);
        return txs.reduce((acc, t) => t.type === 'DEBIT' ? acc + t.amount : acc - t.amount, 0);
    }
};

Storage.seed();
