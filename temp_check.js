window.alert('SISTEM YUKLENIYOR...');
console.log('bundle.js: starting...');
const SUPABASE_URL = 'https://pktxasnposdltilqufcq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBrdHhhc25wb3NkbHRpbHF1ZmNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzOTQ5NjYsImV4cCI6MjA4OTk3MDk2Nn0.53Zb6UJVo4sXLZB1Y1lmp5EeqOT8IGzYZco99l6gz3Y';

let supabase;
try {
    if (window.supabase) {
        supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
        console.log('bundle.js: Supabase connected.');
    } else {
        console.error('bundle.js: Supabase SDK not found!');
    }
} catch (e) {
    console.error('bundle.js: Supabase error:', e);
}

const Data = {
    currentUser: null,
    isAdmin: false,

    async login(username, password) {
        console.log('data.js: Login attempt:', username);
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
        const payload = { customer_id: o.customer_id, date: today, type: 'DEBIT', amount: total, description: 'Siparis', ref: 'ORDER' };
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
console.log('data.js: Loaded.');


const state = {
    currentPage: 'dashboard',
    modals: {
        customer: false,
        product: false
    }
};

async function init() {
    console.log('init: starting...');
    try {
        setupNavigation();
        setupEventListeners();
        setupLoginEventListeners();
        updateDate();
        
        const isAuthenticated = await Data.checkAuth();
        if (isAuthenticated) {
            await showApp();
        } else {
            showLogin();
        }
        console.log('init: completed successfully.');
    } catch (e) {
        console.error('init: CRITICAL ERROR:', e);
        alert('UYARI: Sistem baslatilamadi! Hata: ' + e.message);
    }
}

function showLogin() {
    document.getElementById('login-overlay').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
}

async function showApp() {
    document.getElementById('login-overlay').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    
    const sidebar = document.querySelector('.sidebar');
    const navItems = document.querySelectorAll('.nav-item');
    
    if (Data.isAdmin) {
        sidebar.classList.remove('hidden');
        await renderPage('dashboard');
    } else {
        sidebar.classList.add('hidden');
        await renderPage('customer-portal');
    }
    lucide.createIcons();
}

function setupLoginEventListeners() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    const tabs = document.querySelectorAll('.login-tab');
    const roleInput = document.getElementById('login-role');
    const usernameLabel = document.getElementById('username-label');
    const usernameInput = document.getElementById('login-username');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const role = tab.dataset.role;
            roleInput.value = role;

            if (role === 'admin') {
                usernameLabel.textContent = 'Yonetici Adi';
                usernameInput.placeholder = 'admin';
            } else {
                usernameLabel.textContent = 'Telefon Numaraniz';
                usernameInput.placeholder = '5XX XXX XX XX';
            }
        });
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const usernameInput = document.getElementById('login-username');
        const passwordInput = document.getElementById('login-password');
        const loginBtn = loginForm.querySelector('button[type="submit"]');
        const errorMsg = document.getElementById('login-error');
        
        const originalText = loginBtn.textContent;
        loginBtn.textContent = 'Giris Yapiliyor...';
        loginBtn.disabled = true;
        errorMsg.classList.add('hidden');

        try {
            console.log('Attempting login for:', usernameInput.value);
            const success = await Data.login(usernameInput.value, passwordInput.value);
            if (success) {
                console.log('Login success');
                await showApp();
            } else {
                console.warn('Login failed: Invalid credentials');
                errorMsg.classList.remove('hidden');
            }
        } catch (err) {
            console.error('Login error:', err);
            errorMsg.textContent = 'Bir hata olustu: ' + (err.message || 'Bilinmeyen hata');
            errorMsg.classList.remove('hidden');
        } finally {
            loginBtn.textContent = originalText;
            loginBtn.disabled = false;
        }
    });
}

function updateDate() {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateEl = document.getElementById('current-date');
    if (dateEl) dateEl.textContent = new Date().toLocaleDateString('tr-TR', options);
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', async (e) => {
            const page = e.currentTarget.dataset.page;
            navItems.forEach(i => i.classList.remove('active'));
            e.currentTarget.classList.add('active');
            state.currentPage = page;
            await renderPage(page);
        });
    });
}

function setupEventListeners() {
    const closeBtn = document.getElementById('close-modal');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    
    const exportBtn = document.getElementById('btn-export-daily');
    if (exportBtn) exportBtn.addEventListener('click', exportDailyOrders);
    
    document.addEventListener('click', async (e) => {
        const target = e.target.closest('button');
        if (!target) return;

        if (target.id === 'btn-apply-bulk') handleBulkApply();
        if (target.id === 'btn-delete-bulk') handleBulkDelete();
        if (target.id === 'btn-cancel-bulk') handleBulkCancel();
        if (target.classList.contains('btn-save-row')) await saveCustomerOrder(target.dataset.id);
        if (target.classList.contains('btn-edit-customer')) await showCustomerModal(target.dataset.id);
        if (target.classList.contains('btn-delete-customer')) {
            if(confirm('Musteriyi silmek istediginize emin misiniz?')) {
                await Data.deleteCustomer(parseInt(target.dataset.id));
                await renderPage('customers');
            }
        }
        if (target.classList.contains('btn-filter')) handleRegionFilter(target);
        if (target.id === 'btn-logout') {
            Data.logout();
            location.reload();
        }
    });

    document.addEventListener('change', (e) => {
        if (e.target.id === 'select-all-customers') {
            const checkboxes = document.querySelectorAll('.customer-checkbox');
            checkboxes.forEach(cb => cb.checked = e.target.checked);
            updateBulkBar();
        }
        if (e.target.classList.contains('customer-checkbox')) {
            updateBulkBar();
        }
    });
}

async function renderPage(page) {
    const content = document.getElementById('content-area');
    const title = document.getElementById('page-title');
    if (!content || !title) return;
    
    switch(page) {
        case 'dashboard':
            title.textContent = 'Anasayfa';
            await renderDashboard(content);
            break;
        case 'daily-entry':
            title.textContent = 'Gunluk Lavas Girisi';
            await renderDailyEntry(content);
            break;
        case 'customer-portal':
            title.textContent = 'Musteri Paneli';
            await renderCustomerPortal(content);
            break;
        case 'customers':
            title.textContent = 'Musteri Yonetimi';
            await renderCustomers(content);
            break;
        case 'products':
            title.textContent = 'Urun Yonetimi';
            await renderProducts(content);
            break;
        case 'reports':
            title.textContent = 'Cari Raporlar';
            await renderReports(content);
            break;
    }
    lucide.createIcons();
}

// --- Dashboard ---
async function renderDashboard(container) {
    const orders = await Data.getOrders();
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.date === todayStr);
    
    let totalLavas = 0;
    todayOrders.forEach(o => {
        o.items.forEach(item => totalLavas += item.quantity);
    });

    const customers = await Data.getCustomers();
    let totalBalance = 0;
    for (const c of customers) {
        totalBalance += await Data.getCustomerBalance(c.id);
    }

    container.innerHTML = `
        <div class="dashboard-grid">
            <div class="stat-card">
                <span class="stat-title">Bugunku Toplam Lavas</span>
                <span class="stat-value">${totalLavas} Adet</span>
            </div>
            <div class="stat-card">
                <span class="stat-title">Aktif Musteri Sayisi</span>
                <span class="stat-value">${customers.length}</span>
            </div>
            <div class="stat-card">
                <span class="stat-title">Toplam Alacak</span>
                <span class="stat-value">${totalBalance.toLocaleString('tr-TR')} TL</span>
            </div>
        </div>
        <div style="margin-top: 2rem; display: flex; justify-content: flex-end;">
            <button class="btn btn-secondary" id="btn-logout">
                <i data-lucide="log-out"></i> Guvenli Cikis
            </button>
        </div>
    `;
}

// --- Daily Entry ---
async function renderDailyEntry(container) {
    const customers = await Data.getCustomers();
    const products = await Data.getProducts();
    const orders = await Data.getOrders();
    const todayStr = new Date().toISOString().split('T')[0];

    if (customers.length === 0) {
        container.innerHTML = `<div class="alert">Once musteri eklemelisiniz.</div>`;
        return;
    }

    container.innerHTML = `
        <div style="margin-bottom: 1.5rem; display: flex; gap: 1rem; align-items: center;">
            <span style="font-weight: 600; font-size: 0.9rem;">Filtrele:</span>
            <button class="btn btn-filter active btn-primary" data-region="ALL">Tumu</button>
            <button class="btn btn-filter" data-region="BOSNA">BOSNA</button>
            <button class="btn btn-filter" data-region="CARSI">CARSI</button>
            <button class="btn btn-filter" data-region="MERAM">MERAM SANAYI</button>
        </div>
        <div class="table-container" style="overflow-x: auto;">
            <table id="daily-matrix-table">
                <thead>
                    <tr>
                        <th style="width: 40px;">#</th>
                        <th style="min-width: 150px;">Musteri</th>
                        <th style="min-width: 100px;">Bolge</th>
                        ${products.map(p => `<th style="text-align: center;">${p.name}</th>`).join('')}
                        <th style="text-align: center;">Islem</th>
                    </tr>
                </thead>
                <tbody>
                    ${customers.map((c, idx) => {
                        const order = orders.find(o => o.customer_id === c.id && o.date === todayStr);
                        return `
                            <tr data-customer-id="${c.id}">
                                <td style="color: var(--text-muted); font-size: 0.85rem;">${idx + 1}</td>
                                <td style="font-weight: 600;">${c.name}</td>
                                <td>${c.region === 'CARSI' ? 'CARSI' : (c.region === 'MERAM' ? 'MERAM SANAYI' : (c.region || '-'))}</td>
                                ${products.map(p => {
                                    const item = order ? order.items.find(i => i.productId === p.id) : null;
                                    const qty = item ? item.quantity : 0;
                                    return `<td><input type="number" class="matrix-input q-input" data-product-id="${p.id}" value="${qty}"></td>`;
                                }).join('')}
                                <td style="text-align: center;">
                                    <button class="btn btn-primary btn-save-row" data-id="${c.id}">Kaydet</button>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
        <div style="margin-top: 1.5rem; text-align: right;">
             <button class="btn btn-primary" style="background: #10b981;" id="btn-save-all">
                <i data-lucide="check-circle-2"></i> Tumunu Kaydet
             </button>
        </div>
    `;

    document.getElementById('btn-save-all').addEventListener('click', async () => {
        for (const c of customers) {
            await saveCustomerOrder(c.id);
        }
        alert('Tum girisler kaydedildi.');
    });
}

// --- Customer Portal ---
async function renderCustomerPortal(container) {
    const user = Data.currentUser;
    const balance = await Data.getCustomerBalance(user.id);
    const products = await Data.getProducts();
    const orders = await Data.getOrders();
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrder = orders.find(o => o.customer_id === user.id && o.date === todayStr);

    container.innerHTML = `
        <div class="customer-balance-card">
            <div class="balance-info">
                <h3>Guncel Cari Bakiyeniz</h3>
                <div class="balance-amount">${balance.toLocaleString('tr-TR')} TL</div>
            </div>
            <button class="btn btn-secondary" id="btn-logout" style="background: rgba(255,255,255,0.2); border: none; color: white;">
                <i data-lucide="log-out"></i> Cikis
            </button>
        </div>

        <div class="stat-card" style="margin-bottom: 2rem;">
            <h2 style="font-size: 1.25rem; margin-bottom: 1.5rem;">Bugunku Siparisiniz</h2>
            <form id="customer-order-form">
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem;">
                    ${products.map(p => {
                        const item = todayOrder ? todayOrder.items.find(i => i.productId === p.id) : null;
                        const qty = item ? item.quantity : 0;
                        const specPrice = user.special_prices && user.special_prices[p.id] ? user.special_prices[p.id] : p.default_price;
                        return `
                            <div class="form-group">
                                <label>${p.name} (${specPrice} TL)</label>
                                <input type="number" class="form-control portal-q-input" data-product-id="${p.id}" value="${qty}" min="0">
                            </div>
                        `;
                    }).join('')}
                </div>
                <button type="submit" class="btn btn-primary" style="margin-top: 2rem; width: 100%; padding: 1rem;">Siparisi Kaydet / Guncelle</button>
            </form>
        </div>
    `;

    document.getElementById('customer-order-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const inputs = document.querySelectorAll('.portal-q-input');
        const items = [];
        inputs.forEach(input => {
            const productId = parseInt(input.dataset.productId);
            const quantity = parseInt(input.value) || 0;
            const product = products.find(p => p.id === productId);
            const price = user.special_prices && user.special_prices[productId] ? user.special_prices[productId] : product.default_price;
            if (quantity > 0) items.push({ productId, quantity, price });
        });

        await Data.saveOrder({ customer_id: user.id, items });
        alert('Siparisiniz basariyla kaydedildi.');
        await renderCustomerPortal(container);
    });
}

async function saveCustomerOrder(customerId) {
    const row = document.querySelector(`tr[data-customer-id="${customerId}"]`);
    if (!row) return;
    const inputs = row.querySelectorAll('.q-input');
    const customers = await Data.getCustomers();
    const customer = customers.find(c => c.id == customerId);
    const products = await Data.getProducts();
    
    const items = [];
    inputs.forEach(input => {
        const productId = parseInt(input.dataset.productId);
        const quantity = parseInt(input.value) || 0;
        const product = products.find(p => p.id === productId);
        const price = (customer.special_prices && customer.special_prices[productId]) ? customer.special_prices[productId] : product.default_price;
        if (quantity > 0) items.push({ productId, quantity, price });
    });

    await Data.saveOrder({ customer_id: parseInt(customerId), items });
    row.style.background = '#f0fdf4';
    setTimeout(() => row.style.background = 'transparent', 1000);
}

// --- Customer Management ---
async function renderCustomers(container) {
    const customers = await Data.getCustomers();
    const products = await Data.getProducts();

    container.innerHTML = `
        <div style="margin-bottom: 1.5rem; display: flex; gap: 1rem;">
            <input type="file" id="excel-import-input" accept=".xlsx, .xls" style="display: none;">
            <button class="btn btn-secondary" id="btn-import-excel">
                <i data-lucide="upload"></i> Excel'den Aktar
            </button>
            <button class="btn btn-primary" id="btn-add-customer">
                <i data-lucide="user-plus"></i> Yeni Musteri Ekle
            </button>
        </div>
        
        <div id="bulk-actions-bar" class="hidden" style="margin-bottom: 1.5rem; background: #fff7ed; padding: 1rem 1.5rem; border-radius: 12px; border: 1px solid #fdba74; display: flex; align-items: center; gap: 1.5rem;">
            <span id="selection-count" style="font-weight: 700; color: #ea580c; font-size: 0.95rem;">0 Secili</span>
            <div style="height: 24px; width: 1px; background: #fdba74;"></div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <label style="font-size: 0.9rem; font-weight: 600; color: #9a3412;">Toplu Bolge Degistir:</label>
                <select id="bulk-region-select" class="form-control" style="width: auto; padding: 0.3rem 0.6rem; height: auto; border-color: #fdba74;">
                    <option value="BOSNA">BOSNA</option>
                    <option value="CARSI">CARSI</option>
                    <option value="MERAM">MERAM SANAYI</option>
                </select>
            </div>
            <button class="btn btn-primary" id="btn-apply-bulk" style="padding: 0.5rem 1.2rem; background: #ea580c; border: none;">Uygula</button>
            <div style="flex-grow: 1;"></div>
            <button class="btn" id="btn-delete-bulk" style="background: #fff1f2; color: #be123c; border: 1px solid #fecdd3; padding: 0.5rem 1.2rem; font-weight: 600;">
                <i data-lucide="trash-2" style="width: 16px; height: 16px; margin-right: 4px;"></i> Secilenleri Sil
            </button>
            <button class="btn" id="btn-cancel-bulk" style="background: white; border: 1px solid #e2e8f0; padding: 0.5rem 1.2rem; color: #64748b;">Vazgec</button>
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px;"><input type="checkbox" id="select-all-customers"></th>
                        <th style="width: 40px;">#</th>
                        <th>Musteri Adi</th>
                        <th>Bolge</th>
                        <th>Telefon</th>
                        <th>Guncel Bakiye</th>
                        <th>Islemler</th>
                    </tr>
                </thead>
                <tbody>
                    ${await Promise.all(customers.map(async (c, idx) => {
                        const balance = await Data.getCustomerBalance(c.id);
                        return `
                            <tr data-id="${c.id}">
                                <td><input type="checkbox" class="customer-checkbox" data-id="${c.id}"></td>
                                <td style="color: var(--text-muted); font-size: 0.85rem;">${idx + 1}</td>
                                <td style="font-weight: 600;">${c.name}</td>
                                <td><span class="badge ${c.region === 'BOSNA' ? 'badge-bosna' : (c.region === 'CARSI' ? 'badge-carsi' : 'badge-meram')}">${c.region === 'CARSI' ? 'CARSI' : (c.region === 'MERAM' ? 'MERAM SANAYI' : (c.region || 'Belirtilmemis'))}</span></td>
                                <td>${c.phone || '-'}</td>
                                <td style="font-weight: 700; color: #ef4444">${balance.toLocaleString('tr-TR')} TL</td>
                                <td>
                                    <button class="btn btn-edit-customer" data-id="${c.id}" style="color: #2563eb; background: #eff6ff;">
                                        <i data-lucide="edit-2"></i> Duzenle
                                    </button>
                                    <button class="btn btn-delete-customer" data-id="${c.id}" style="color: #ef4444; background: #fef2f2;">
                                        <i data-lucide="trash"></i> Sil
                                    </button>
                                </td>
                            </tr>
                        `;
                    })).then(rows => rows.join(''))}
                    ${customers.length === 0 ? '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Henuz musteri yok.</td></tr>' : ''}
                </tbody>
            </table>
        </div>
    `;

    updateBulkBar();

    document.getElementById('btn-import-excel').addEventListener('click', () => {
        document.getElementById('excel-import-input').click();
    });

    document.getElementById('excel-import-input').addEventListener('change', (e) => {
        handleCustomerImport(e);
    });

    document.getElementById('btn-add-customer').addEventListener('click', () => {
        showCustomerModal();
    });

    lucide.createIcons();
}

function updateBulkBar() {
    const bulkBar = document.getElementById('bulk-actions-bar');
    const selectionCount = document.getElementById('selection-count');
    if (!bulkBar) return;
    
    const checkboxes = document.querySelectorAll('.customer-checkbox');
    const selected = Array.from(checkboxes).filter(cb => cb.checked);
    if (selected.length > 0) {
        bulkBar.classList.remove('hidden');
        selectionCount.textContent = `${selected.length} Secili`;
    } else {
        bulkBar.classList.add('hidden');
    }
}

function handleBulkCancel() {
    const selectAll = document.getElementById('select-all-customers');
    if (selectAll) selectAll.checked = false;
    document.querySelectorAll('.customer-checkbox').forEach(cb => cb.checked = false);
    updateBulkBar();
}

async function handleBulkApply() {
    const checkboxes = document.querySelectorAll('.customer-checkbox');
    const selectedIds = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.id);
    
    const newRegion = document.getElementById('bulk-region-select').value;

    if (selectedIds.length === 0) {
        alert('Lutfen en az bir musteri secin.');
        return;
    }

    if (confirm(`${selectedIds.length} musterinin bolgesini ${newRegion} olarak degistirmek istediginize emin misiniz?`)) {
        try {
            const allCustomers = await Data.getCustomers();
            for (const id of selectedIds) {
                const customer = allCustomers.find(c => (c.id || '').toString() === id.toString());
                if (customer) {
                    customer.region = newRegion;
                    await Data.saveCustomer(customer);
                }
            }
            alert('Toplu duzenleme tamamlandi.');
            await renderPage('customers');
        } catch (err) {
            alert('Bir hata olustu: ' + err.message);
        }
    }
}

async function handleBulkDelete() {
    const checkboxes = document.querySelectorAll('.customer-checkbox');
    const selectedIds = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.id);

    if (selectedIds.length === 0) {
        alert('Lutfen en az bir musteri secin.');
        return;
    }

    if (confirm(`${selectedIds.length} musteriyi silmek istediginize emin misiniz? Bu islem geri alinamaz!`)) {
        try {
            for (const id of selectedIds) {
                await Data.deleteCustomer(parseInt(id));
            }
            alert('Secili musteriler silindi.');
            await renderPage('customers');
        } catch (err) {
            alert('Bir hata olustu: ' + err.message);
        }
    }
}

async function handleRegionFilter(btn) {
    const region = btn.dataset.region;
    const filterBtns = document.querySelectorAll('.btn-filter');
    filterBtns.forEach(b => b.classList.remove('active', 'btn-primary'));
    btn.classList.add('active', 'btn-primary');
    
    const rows = document.querySelectorAll('#daily-matrix-table tbody tr');
    const customers = await Data.getCustomers();
    rows.forEach(row => {
        const customerId = row.dataset.customerId;
        const customer = customers.find(c => c.id == customerId);
        if (region === 'ALL' || customer.region === region) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

async function showCustomerModal(id = null) {
    const customers = await Data.getCustomers();
    const customer = id ? customers.find(c => c.id == id) : null;
    const products = await Data.getProducts();
    
    const title = id ? 'Musteri Duzenle' : 'Yeni Musteri Ekle';
    const body = `
        <form id="customer-form">
            <div class="form-group" style="margin-bottom: 0.75rem;">
                <label style="margin-bottom: 0.25rem;">Musteri Adi</label>
                <input type="text" id="cust-name" class="form-control" value="${customer ? customer.name : ''}" required>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
                <label style="margin-bottom: 0.25rem;">Telefon / Kullanici Adi</label>
                <input type="text" id="cust-phone" class="form-control" value="${customer ? customer.phone || '' : ''}" required>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
                <label style="margin-bottom: 0.25rem;">Giris Sifresi</label>
                <input type="text" id="cust-password" class="form-control" value="${customer ? customer.password || '1234' : '1234'}" required>
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
                <label style="margin-bottom: 0.25rem;">Bolge</label>
                <div style="display: flex; gap: 1rem; margin-top: 0.25rem; padding: 0.4rem; background: #f8fafc; border-radius: 8px; border: 1px solid var(--border); font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
                        <input type="radio" name="region" value="BOSNA" ${customer && customer.region === 'BOSNA' ? 'checked' : (!customer ? 'checked' : '')}> 
                        <span>BOSNA</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
                        <input type="radio" name="region" value="CARSI" ${customer && customer.region === 'CARSI' ? 'checked' : ''}> 
                        <span>CARSI</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
                        <input type="radio" name="region" value="MERAM" ${customer && customer.region === 'MERAM' ? 'checked' : ''}> 
                        <span>MERAM</span>
                    </label>
                </div>
            </div>
            
            <h4 style="margin: 0.5rem 0 0.75rem; border-bottom: 2px solid var(--primary); display: inline-block; font-size: 0.9rem;">Ozel Fiyatlar (TL)</h4>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.75rem;">
                ${products.map(p => `
                    <div class="form-group" style="margin-bottom: 0;">
                        <label style="font-size: 0.75rem; margin-bottom: 0.2rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${p.name}">${p.name}</label>
                        <input type="number" step="0.01" class="form-control price-input" style="padding: 0.4rem; font-size: 0.85rem;" data-product-id="${p.id}" value="${customer && customer.special_prices && customer.special_prices[p.id] ? customer.special_prices[p.id] : ''}" placeholder="${p.default_price}">
                    </div>
                `).join('')}
            </div>
            
            <div style="margin-top: 2rem; display: flex; gap: 1rem;">
                <button type="submit" class="btn btn-primary" style="flex: 1;">Kaydet</button>
                <button type="button" class="btn" style="background: #e2e8f0;" onclick="closeModal()">Iptal</button>
            </div>
        </form>
    `;

    openModal(title, body);
    
    document.getElementById('customer-form').onsubmit = async (e) => {
        e.preventDefault();
        const prices = {};
        document.querySelectorAll('.price-input').forEach(input => {
            if (input.value) prices[input.dataset.productId] = parseFloat(input.value);
        });
        
        const data = {
            id: id ? parseInt(id) : null,
            name: document.getElementById('cust-name').value,
            phone: document.getElementById('cust-phone').value,
            password: document.getElementById('cust-password').value,
            region: document.querySelector('input[name="region"]:checked').value,
            special_prices: prices
        };
        
        await Data.saveCustomer(data);
        closeModal();
        await renderPage('customers');
    };
}

// --- Product Management ---
async function renderProducts(container) {
    const products = await Data.getProducts();
    
    container.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            <button class="btn btn-primary" id="btn-add-product">
                <i data-lucide="plus-circle"></i> Yeni Urun Ekle
            </button>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Urun Adi</th>
                        <th>Varsayilan Fiyat</th>
                        <th>Islemler</th>
                    </tr>
                </thead>
                <tbody>
                    ${products.map(p => `
                        <tr>
                            <td style="font-weight: 600;">${p.name}</td>
                            <td style="font-weight: 700;">${p.default_price.toLocaleString('tr-TR')} TL</td>
                            <td>
                                <button class="btn btn-edit-product" data-id="${p.id}" style="padding: 0.3rem 0.6rem; color: #2563eb; background: #eff6ff;"> Duzenle </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;

    document.getElementById('btn-add-product').addEventListener('click', () => showProductModal());
    document.querySelectorAll('.btn-edit-product').forEach(btn => btn.addEventListener('click', (e) => showProductModal(e.currentTarget.dataset.id)));
    lucide.createIcons();
}

async function showProductModal(id = null) {
    const products = await Data.getProducts();
    const product = id ? products.find(p => p.id == id) : null;
    const title = id ? 'Urunu Duzenle' : 'Yeni Urun Ekle';
    const body = `
        <form id="product-form">
            <div class="form-group">
                <label>Urun Adi</label>
                <input type="text" id="prod-name" class="form-control" value="${product ? product.name : ''}" required>
            </div>
            <div class="form-group">
                <label>Varsayilan Birim Fiyat (TL)</label>
                <input type="number" step="0.01" id="prod-price" class="form-control" value="${product ? product.default_price : ''}" required>
            </div>
            <div style="margin-top: 2rem; display: flex; gap: 1rem;">
                <button type="submit" class="btn btn-primary" style="flex: 1;">Kaydet</button>
                <button type="button" class="btn" style="background: #e2e8f0;" onclick="closeModal()">Iptal</button>
            </div>
        </form>
    `;
    
    openModal(title, body);
    
    document.getElementById('product-form').onsubmit = async (e) => {
        e.preventDefault();
        await Data.saveProduct({
            id: id ? parseInt(id) : null,
            name: document.getElementById('prod-name').value,
            default_price: parseFloat(document.getElementById('prod-price').value)
        });
        closeModal();
        await renderPage('products');
    };
}

// --- Reports & Cari ---
async function renderReports(container) {
    const customers = await Data.getCustomers();
    
    container.innerHTML = `
        <div class="dashboard-grid">
            ${await Promise.all(customers.map(async (c) => {
                const balance = await Data.getCustomerBalance(c.id);
                return `
                    <div class="stat-card" style="cursor: pointer;" onclick="showCariDetail(${c.id})">
                        <span class="stat-title">${c.name}</span>
                        <span class="stat-value" style="color: #ef4444">${balance.toLocaleString('tr-TR')} TL</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted)">Detayli dokum icin tikla</span>
                    </div>
                `;
            })).then(cards => cards.join(''))}
        </div>
    `;
}

async function showCariDetail(customerId) {
    const customers = await Data.getCustomers();
    const customer = customers.find(c => c.id == customerId);
    const transactions = await Data.getTransactions();
    const txs = transactions.filter(t => t.customer_id == customerId);
    const balance = await Data.getCustomerBalance(customerId);
    
    const title = `${customer.name} - Cari Detayi`;
    const body = `
        <div style="margin-bottom: 1rem; display: flex; justify-content: space-between;">
            <div><strong>Toplam Bakiye:</strong> <span style="color: #ef4444; font-weight: 700;">${balance.toLocaleString('tr-TR')} TL</span></div>
            <button class="btn btn-primary" style="padding: 0.3rem 0.8rem; background: #10b981;" onclick="addPaymentModal(${customerId})">Odeme Al</button>
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
            <table style="font-size: 0.8rem;">
                <thead>
                    <tr>
                        <th>Tarih</th>
                        <th>Aciklama</th>
                        <th>Borc (+)</th>
                        <th>Alacak (-)</th>
                    </tr>
                </thead>
                <tbody>
                    ${txs.reverse().map(t => `
                        <tr>
                            <td>${t.date}</td>
                            <td>${t.description}</td>
                            <td>${t.type === 'DEBIT' ? t.amount.toLocaleString('tr-TR') + ' TL' : '-'}</td>
                            <td style="color: #10b981">${t.type === 'CREDIT' ? t.amount.toLocaleString('tr-TR') + ' TL' : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    openModal(title, body);
}

window.addPaymentModal = function(customerId) {
    const title = 'Odeme Girisi';
    const body = `
        <form id="payment-form">
            <div class="form-group">
                <label>Odeme Tutari (TL)</label>
                <input type="number" id="pay-amount" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Aciklama</label>
                <input type="text" id="pay-desc" class="form-control" value="Tahsilat" required>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">Kaydet</button>
        </form>
    `;
    
    openModal(title, body);
    
    document.getElementById('payment-form').onsubmit = async (e) => {
        e.preventDefault();
        await Data.addPayment(customerId, parseFloat(document.getElementById('pay-amount').value), document.getElementById('pay-desc').value);
        closeModal();
        await renderPage('reports');
    };
};

// --- Utils ---
function openModal(title, content) {
    document.getElementById('modal-title').textContent = title;
    document.getElementById('modal-body').innerHTML = content;
    document.getElementById('modal-container').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('modal-container').classList.add('hidden');
}

async function exportDailyOrders() {
    const [orders, products, customers] = await Promise.all([
        Data.getOrders(),
        Data.getProducts(),
        Data.getCustomers()
    ]);
    const todayStr = new Date().toISOString().split('T')[0];
    const todayOrders = orders.filter(o => o.date === todayStr);
    
    const exportData = todayOrders.map(o => {
        const customer = customers.find(c => c.id === o.customer_id);
        const row = { 
            "Musteri": customer ? customer.name : 'Bilinmeyen',
            "Bolge": customer ? (customer.region === 'CARSI' ? 'CARSI' : (customer.region === 'MERAM' ? 'MERAM' : customer.region)) : '-'
        };
        products.forEach(p => {
            const item = o.items.find(i => i.productId === p.id);
            row[p.name] = item ? item.quantity : 0;
        });
        return row;
    });

    if (exportData.length === 0) {
        alert('Bugun icin henuz siparis girilmemis.');
        return;
    }

    exportData.sort((a, b) => (a.Bolge || '').localeCompare(b.Bolge || ''));

    const totalRow = { "Musteri": "GENEL TOPLAM", "Bolge": "" };
    products.forEach(p => {
        totalRow[p.name] = exportData.reduce((sum, row) => sum + (row[p.name] || 0), 0);
    });
    exportData.push(totalRow);

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Gunluk Uretim");
    XLSX.writeFile(wb, `Lavas_Uretim_${todayStr}.xlsx`);
}

async function handleCustomerImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async function(e) {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        let importCount = 0;
        
        let startIdx = 0;
        const firstRow = rows[0] || [];
        const headerKeywords = ['ad', 'musteri', 'customer', 'name', 'tel', 'telefon', 'bolge', 'bolge', 'region'];
        const isHeader = firstRow.some(cell => 
            cell && headerKeywords.some(k => cell.toString().toLowerCase().includes(k))
        );
        
        if (isHeader) startIdx = 1;

        for (let i = startIdx; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            let name = row[0]; 
            let phone = row[1] || '-';
            let region = row[2] || 'BOSNA';

            if (isHeader) {
                const headerRow = rows[0];
                const nameIdx = headerRow.findIndex(h => h && ['ad', 'musteri', 'name', 'isim'].some(k => h.toString().toLowerCase().includes(k)));
                const telIdx = headerRow.findIndex(h => h && ['tel', 'telefon', 'phone', 'numara'].some(k => h.toString().toLowerCase().includes(k)));
                const regIdx = headerRow.findIndex(h => h && ['bolge', 'bolge', 'region'].some(k => h.toString().toLowerCase().includes(k)));
                
                if (nameIdx !== -1) name = row[nameIdx];
                if (telIdx !== -1) phone = row[telIdx] || '-';
                if (regIdx !== -1) region = row[regIdx] || 'BOSNA';
            }

            if (name && name.toString().trim()) {
                let normalizedRegion = region.toString().toUpperCase();
                if (normalizedRegion.includes('CARSI') || normalizedRegion.includes('CARSI')) normalizedRegion = 'CARSI';
                else if (normalizedRegion.includes('MERAM')) normalizedRegion = 'MERAM';
                else normalizedRegion = 'BOSNA';

                await Data.saveCustomer({
                    id: null,
                    name: name.toString().trim(),
                    phone: phone.toString().trim(),
                    password: '1234',
                    region: normalizedRegion,
                    special_prices: {}
                });
                importCount++;
            }
        }

        alert(`${importCount} musteri basariyla aktarildi.`);
        await renderPage('customers');
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}

// Application Logic
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
} else {
    init();
}
