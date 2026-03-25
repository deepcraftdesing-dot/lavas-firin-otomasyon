// Application Logic
document.addEventListener('DOMContentLoaded', async () => {
    await init();
});

const state = {
    currentPage: 'dashboard',
    modals: {
        customer: false,
        product: false
    }
};

async function init() {
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
                usernameLabel.textContent = 'Yönetici Adı';
                usernameInput.placeholder = 'admin';
            } else {
                usernameLabel.textContent = 'Telefon Numaranız';
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
        loginBtn.textContent = 'Giriş Yapılıyor...';
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
            errorMsg.textContent = 'Bir hata oluştu: ' + (err.message || 'Bilinmeyen hata');
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
            if(confirm('Müşteriyi silmek istediğinize emin misiniz?')) {
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
            title.textContent = 'Günlük Lavaş Girişi';
            await renderDailyEntry(content);
            break;
        case 'customer-portal':
            title.textContent = 'Müşteri Paneli';
            await renderCustomerPortal(content);
            break;
        case 'customers':
            title.textContent = 'Müşteri Yönetimi';
            await renderCustomers(content);
            break;
        case 'products':
            title.textContent = 'Ürün Yönetimi';
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
                <span class="stat-title">Bugünkü Toplam Lavaş</span>
                <span class="stat-value">${totalLavas} Adet</span>
            </div>
            <div class="stat-card">
                <span class="stat-title">Aktif Müşteri Sayısı</span>
                <span class="stat-value">${customers.length}</span>
            </div>
            <div class="stat-card">
                <span class="stat-title">Toplam Alacak</span>
                <span class="stat-value">${totalBalance.toLocaleString('tr-TR')} ₺</span>
            </div>
        </div>
        <div style="margin-top: 2rem; display: flex; justify-content: flex-end;">
            <button class="btn btn-secondary" id="btn-logout">
                <i data-lucide="log-out"></i> Güvenli Çıkış
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
        container.innerHTML = `<div class="alert">Önce müşteri eklemelisiniz.</div>`;
        return;
    }

    container.innerHTML = `
        <div style="margin-bottom: 1.5rem; display: flex; gap: 1rem; align-items: center;">
            <span style="font-weight: 600; font-size: 0.9rem;">Filtrele:</span>
            <button class="btn btn-filter active btn-primary" data-region="ALL">Tümü</button>
            <button class="btn btn-filter" data-region="BOSNA">BOSNA</button>
            <button class="btn btn-filter" data-region="CARSI">ÇARŞI</button>
            <button class="btn btn-filter" data-region="MERAM">MERAM SANAYİ</button>
        </div>
        <div class="table-container" style="overflow-x: auto;">
            <table id="daily-matrix-table">
                <thead>
                    <tr>
                        <th style="width: 40px;">#</th>
                        <th style="min-width: 150px;">Müşteri</th>
                        <th style="min-width: 100px;">Bölge</th>
                        ${products.map(p => `<th style="text-align: center;">${p.name}</th>`).join('')}
                        <th style="text-align: center;">İşlem</th>
                    </tr>
                </thead>
                <tbody>
                    ${customers.map((c, idx) => {
                        const order = orders.find(o => o.customer_id === c.id && o.date === todayStr);
                        return `
                            <tr data-customer-id="${c.id}">
                                <td style="color: var(--text-muted); font-size: 0.85rem;">${idx + 1}</td>
                                <td style="font-weight: 600;">${c.name}</td>
                                <td>${c.region === 'CARSI' ? 'ÇARŞI' : (c.region === 'MERAM' ? 'MERAM SANAYİ' : (c.region || '-'))}</td>
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
                <i data-lucide="check-circle-2"></i> Tümünü Kaydet
             </button>
        </div>
    `;

    document.getElementById('btn-save-all').addEventListener('click', async () => {
        for (const c of customers) {
            await saveCustomerOrder(c.id);
        }
        alert('Tüm girişler kaydedildi.');
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
                <h3>Güncel Cari Bakiyeniz</h3>
                <div class="balance-amount">${balance.toLocaleString('tr-TR')} ₺</div>
            </div>
            <button class="btn btn-secondary" id="btn-logout" style="background: rgba(255,255,255,0.2); border: none; color: white;">
                <i data-lucide="log-out"></i> Çıkış
            </button>
        </div>

        <div class="stat-card" style="margin-bottom: 2rem;">
            <h2 style="font-size: 1.25rem; margin-bottom: 1.5rem;">Bugünkü Siparişiniz</h2>
            <form id="customer-order-form">
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 1.5rem;">
                    ${products.map(p => {
                        const item = todayOrder ? todayOrder.items.find(i => i.productId === p.id) : null;
                        const qty = item ? item.quantity : 0;
                        const specPrice = user.special_prices && user.special_prices[p.id] ? user.special_prices[p.id] : p.default_price;
                        return `
                            <div class="form-group">
                                <label>${p.name} (${specPrice} ₺)</label>
                                <input type="number" class="form-control portal-q-input" data-product-id="${p.id}" value="${qty}" min="0">
                            </div>
                        `;
                    }).join('')}
                </div>
                <button type="submit" class="btn btn-primary" style="margin-top: 2rem; width: 100%; padding: 1rem;">Siparişi Kaydet / Güncelle</button>
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
        alert('Siparişiniz başarıyla kaydedildi.');
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
                <i data-lucide="user-plus"></i> Yeni Müşteri Ekle
            </button>
        </div>
        
        <div id="bulk-actions-bar" class="hidden" style="margin-bottom: 1.5rem; background: #fff7ed; padding: 1rem 1.5rem; border-radius: 12px; border: 1px solid #fdba74; display: flex; align-items: center; gap: 1.5rem;">
            <span id="selection-count" style="font-weight: 700; color: #ea580c; font-size: 0.95rem;">0 Seçili</span>
            <div style="height: 24px; width: 1px; background: #fdba74;"></div>
            <div style="display: flex; align-items: center; gap: 0.75rem;">
                <label style="font-size: 0.9rem; font-weight: 600; color: #9a3412;">Toplu Bölge Değiştir:</label>
                <select id="bulk-region-select" class="form-control" style="width: auto; padding: 0.3rem 0.6rem; height: auto; border-color: #fdba74;">
                    <option value="BOSNA">BOSNA</option>
                    <option value="CARSI">ÇARŞI</option>
                    <option value="MERAM">MERAM SANAYİ</option>
                </select>
            </div>
            <button class="btn btn-primary" id="btn-apply-bulk" style="padding: 0.5rem 1.2rem; background: #ea580c; border: none;">Uygula</button>
            <div style="flex-grow: 1;"></div>
            <button class="btn" id="btn-delete-bulk" style="background: #fff1f2; color: #be123c; border: 1px solid #fecdd3; padding: 0.5rem 1.2rem; font-weight: 600;">
                <i data-lucide="trash-2" style="width: 16px; height: 16px; margin-right: 4px;"></i> Seçilenleri Sil
            </button>
            <button class="btn" id="btn-cancel-bulk" style="background: white; border: 1px solid #e2e8f0; padding: 0.5rem 1.2rem; color: #64748b;">Vazgeç</button>
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th style="width: 40px;"><input type="checkbox" id="select-all-customers"></th>
                        <th style="width: 40px;">#</th>
                        <th>Müşteri Adı</th>
                        <th>Bölge</th>
                        <th>Telefon</th>
                        <th>Güncel Bakiye</th>
                        <th>İşlemler</th>
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
                                <td><span class="badge ${c.region === 'BOSNA' ? 'badge-bosna' : (c.region === 'CARSI' ? 'badge-carsi' : 'badge-meram')}">${c.region === 'CARSI' ? 'ÇARŞI' : (c.region === 'MERAM' ? 'MERAM SANAYİ' : (c.region || 'Belirtilmemiş'))}</span></td>
                                <td>${c.phone || '-'}</td>
                                <td style="font-weight: 700; color: #ef4444">${balance.toLocaleString('tr-TR')} ₺</td>
                                <td>
                                    <button class="btn btn-edit-customer" data-id="${c.id}" style="color: #2563eb; background: #eff6ff;">
                                        <i data-lucide="edit-2"></i> Düzenle
                                    </button>
                                    <button class="btn btn-delete-customer" data-id="${c.id}" style="color: #ef4444; background: #fef2f2;">
                                        <i data-lucide="trash"></i> Sil
                                    </button>
                                </td>
                            </tr>
                        `;
                    })).then(rows => rows.join(''))}
                    ${customers.length === 0 ? '<tr><td colspan="7" style="text-align: center; padding: 2rem;">Henüz müşteri yok.</td></tr>' : ''}
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
        selectionCount.textContent = `${selected.length} Seçili`;
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
        alert('Lütfen en az bir müşteri seçin.');
        return;
    }

    if (confirm(`${selectedIds.length} müşterinin bölgesini ${newRegion} olarak değiştirmek istediğinize emin misiniz?`)) {
        try {
            const allCustomers = await Data.getCustomers();
            for (const id of selectedIds) {
                const customer = allCustomers.find(c => (c.id || '').toString() === id.toString());
                if (customer) {
                    customer.region = newRegion;
                    await Data.saveCustomer(customer);
                }
            }
            alert('Toplu düzenleme tamamlandı.');
            await renderPage('customers');
        } catch (err) {
            alert('Bir hata oluştu: ' + err.message);
        }
    }
}

async function handleBulkDelete() {
    const checkboxes = document.querySelectorAll('.customer-checkbox');
    const selectedIds = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => cb.dataset.id);

    if (selectedIds.length === 0) {
        alert('Lütfen en az bir müşteri seçin.');
        return;
    }

    if (confirm(`${selectedIds.length} müşteriyi silmek istediğinize emin misiniz? Bu işlem geri alınamaz!`)) {
        try {
            for (const id of selectedIds) {
                await Data.deleteCustomer(parseInt(id));
            }
            alert('Seçili müşteriler silindi.');
            await renderPage('customers');
        } catch (err) {
            alert('Bir hata oluştu: ' + err.message);
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
    
    const title = id ? 'Müşteri Düzenle' : 'Yeni Müşteri Ekle';
    const body = `
        <form id="customer-form">
            <div class="form-group" style="margin-bottom: 0.75rem;">
                <label style="margin-bottom: 0.25rem;">Müşteri Adı</label>
                <input type="text" id="cust-name" class="form-control" value="${customer ? customer.name : ''}" required>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
                <label style="margin-bottom: 0.25rem;">Telefon / Kullanıcı Adı</label>
                <input type="text" id="cust-phone" class="form-control" value="${customer ? customer.phone || '' : ''}" required>
            </div>
            <div class="form-group" style="margin-bottom: 0.75rem;">
                <label style="margin-bottom: 0.25rem;">Giriş Şifresi</label>
                <input type="text" id="cust-password" class="form-control" value="${customer ? customer.password || '1234' : '1234'}" required>
            </div>
            <div class="form-group" style="margin-bottom: 1rem;">
                <label style="margin-bottom: 0.25rem;">Bölge</label>
                <div style="display: flex; gap: 1rem; margin-top: 0.25rem; padding: 0.4rem; background: #f8fafc; border-radius: 8px; border: 1px solid var(--border); font-size: 0.85rem;">
                    <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
                        <input type="radio" name="region" value="BOSNA" ${customer && customer.region === 'BOSNA' ? 'checked' : (!customer ? 'checked' : '')}> 
                        <span>BOSNA</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
                        <input type="radio" name="region" value="CARSI" ${customer && customer.region === 'CARSI' ? 'checked' : ''}> 
                        <span>ÇARŞI</span>
                    </label>
                    <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
                        <input type="radio" name="region" value="MERAM" ${customer && customer.region === 'MERAM' ? 'checked' : ''}> 
                        <span>MERAM</span>
                    </label>
                </div>
            </div>
            
            <h4 style="margin: 0.5rem 0 0.75rem; border-bottom: 2px solid var(--primary); display: inline-block; font-size: 0.9rem;">Özel Fiyatlar (₺)</h4>
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
                <button type="button" class="btn" style="background: #e2e8f0;" onclick="closeModal()">İptal</button>
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
                <i data-lucide="plus-circle"></i> Yeni Ürün Ekle
            </button>
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>Ürün Adı</th>
                        <th>Varsayılan Fiyat</th>
                        <th>İşlemler</th>
                    </tr>
                </thead>
                <tbody>
                    ${products.map(p => `
                        <tr>
                            <td style="font-weight: 600;">${p.name}</td>
                            <td style="font-weight: 700;">${p.default_price.toLocaleString('tr-TR')} ₺</td>
                            <td>
                                <button class="btn btn-edit-product" data-id="${p.id}" style="padding: 0.3rem 0.6rem; color: #2563eb; background: #eff6ff;"> Düzenle </button>
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
    const title = id ? 'Ürünü Düzenle' : 'Yeni Ürün Ekle';
    const body = `
        <form id="product-form">
            <div class="form-group">
                <label>Ürün Adı</label>
                <input type="text" id="prod-name" class="form-control" value="${product ? product.name : ''}" required>
            </div>
            <div class="form-group">
                <label>Varsayılan Birim Fiyat (₺)</label>
                <input type="number" step="0.01" id="prod-price" class="form-control" value="${product ? product.default_price : ''}" required>
            </div>
            <div style="margin-top: 2rem; display: flex; gap: 1rem;">
                <button type="submit" class="btn btn-primary" style="flex: 1;">Kaydet</button>
                <button type="button" class="btn" style="background: #e2e8f0;" onclick="closeModal()">İptal</button>
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
                        <span class="stat-value" style="color: #ef4444">${balance.toLocaleString('tr-TR')} ₺</span>
                        <span style="font-size: 0.75rem; color: var(--text-muted)">Detaylı döküm için tıkla</span>
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
    
    const title = `${customer.name} - Cari Detayı`;
    const body = `
        <div style="margin-bottom: 1rem; display: flex; justify-content: space-between;">
            <div><strong>Toplam Bakiye:</strong> <span style="color: #ef4444; font-weight: 700;">${balance.toLocaleString('tr-TR')} ₺</span></div>
            <button class="btn btn-primary" style="padding: 0.3rem 0.8rem; background: #10b981;" onclick="addPaymentModal(${customerId})">Ödeme Al</button>
        </div>
        <div style="max-height: 400px; overflow-y: auto;">
            <table style="font-size: 0.8rem;">
                <thead>
                    <tr>
                        <th>Tarih</th>
                        <th>Açıklama</th>
                        <th>Borç (+)</th>
                        <th>Alacak (-)</th>
                    </tr>
                </thead>
                <tbody>
                    ${txs.reverse().map(t => `
                        <tr>
                            <td>${t.date}</td>
                            <td>${t.description}</td>
                            <td>${t.type === 'DEBIT' ? t.amount.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
                            <td style="color: #10b981">${t.type === 'CREDIT' ? t.amount.toLocaleString('tr-TR') + ' ₺' : '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>
    `;
    
    openModal(title, body);
}

window.addPaymentModal = function(customerId) {
    const title = 'Ödeme Girişi';
    const body = `
        <form id="payment-form">
            <div class="form-group">
                <label>Ödeme Tutarı (₺)</label>
                <input type="number" id="pay-amount" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Açıklama</label>
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
            "Müşteri": customer ? customer.name : 'Bilinmeyen',
            "Bölge": customer ? (customer.region === 'CARSI' ? 'ÇARŞI' : (customer.region === 'MERAM' ? 'MERAM' : customer.region)) : '-'
        };
        products.forEach(p => {
            const item = o.items.find(i => i.productId === p.id);
            row[p.name] = item ? item.quantity : 0;
        });
        return row;
    });

    if (exportData.length === 0) {
        alert('Bugün için henüz sipariş girilmemiş.');
        return;
    }

    exportData.sort((a, b) => (a.Bölge || '').localeCompare(b.Bölge || ''));

    const totalRow = { "Müşteri": "GENEL TOPLAM", "Bölge": "" };
    products.forEach(p => {
        totalRow[p.name] = exportData.reduce((sum, row) => sum + (row[p.name] || 0), 0);
    });
    exportData.push(totalRow);

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Günlük Üretim");
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
        const headerKeywords = ['ad', 'müşteri', 'customer', 'name', 'tel', 'telefon', 'bölge', 'bolge', 'region'];
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
                const nameIdx = headerRow.findIndex(h => h && ['ad', 'müşteri', 'name', 'isim'].some(k => h.toString().toLowerCase().includes(k)));
                const telIdx = headerRow.findIndex(h => h && ['tel', 'telefon', 'phone', 'numara'].some(k => h.toString().toLowerCase().includes(k)));
                const regIdx = headerRow.findIndex(h => h && ['bölge', 'bolge', 'region'].some(k => h.toString().toLowerCase().includes(k)));
                
                if (nameIdx !== -1) name = row[nameIdx];
                if (telIdx !== -1) phone = row[telIdx] || '-';
                if (regIdx !== -1) region = row[regIdx] || 'BOSNA';
            }

            if (name && name.toString().trim()) {
                let normalizedRegion = region.toString().toUpperCase();
                if (normalizedRegion.includes('CARSI') || normalizedRegion.includes('ÇARŞI')) normalizedRegion = 'CARSI';
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

        alert(`${importCount} müşteri başarıyla aktarıldı.`);
        await renderPage('customers');
        event.target.value = '';
    };
    reader.readAsArrayBuffer(file);
}
