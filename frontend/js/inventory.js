document.addEventListener('DOMContentLoaded', async function () {
    let profileId = null;

    try {
        const { data: userData } = await client.auth.getUser();
        profileId = userData?.user?.id;
    } catch (e) {
        console.error('Auth error:', e);
    }

    const inventoryTableBody = document.getElementById('inventoryTableBody');
    const searchInput = document.getElementById('inventorySearch');
    const refreshBtn = document.getElementById('refreshBtn');
    const addProductBtn = document.getElementById('addProductBtn');

    // Modal elements
    const productModal = document.getElementById('productModal');
    const modalTitle = document.getElementById('modalTitle');
    const prodId = document.getElementById('prodId');
    const prodName = document.getElementById('prodName');
    const prodCategory = document.getElementById('prodCategory');
    const prodHsn = document.getElementById('prodHsn');
    const prodPrice = document.getElementById('prodPrice');
    const prodGstRate = document.getElementById('prodGstRate');
    const prodStock = document.getElementById('prodStock');
    const prodThreshold = document.getElementById('prodThreshold');
    const prodCancel = document.getElementById('prodCancel');
    const prodSave = document.getElementById('prodSave');

    let inventoryData = [];

    async function ensureProfile() {
        if (!profileId) {
            const { data: userData } = await client.auth.getUser();
            profileId = userData?.user?.id;
        }
        return profileId;
    }

    async function loadInventory() {
        const pid = await ensureProfile();
        if (!pid) return;

        if (inventoryTableBody) {
            inventoryTableBody.innerHTML = '<tr><td colspan="6" class="empty">Loading inventory...</td></tr>';
        }
        
        try {
            const { data, error } = await client
                .from('inventory')
                .select('*')
                .eq('profile_id', pid)
                .order('name', { ascending: true });

            if (error) throw error;
            inventoryData = data || [];
            renderTable();
            updateKPIs();
        } catch (err) {
            console.error('Error loading inventory:', err);
            if (inventoryTableBody) {
                inventoryTableBody.innerHTML = '<tr><td colspan="6" class="empty">Failed to load inventory.</td></tr>';
            }
        }
    }

    async function updateKPIs() {
        const pid = await ensureProfile();
        if (!pid || !inventoryData) return;
        
        const totalProducts = inventoryData.length;
        const lowStock = inventoryData.filter(item => Number(item.stock) <= Number(item.low_stock_threshold || 5)).length;
        
        const totalEl = document.getElementById('kpiTotalProducts');
        const lowEl = document.getElementById('kpiLowStock');
        if (totalEl) totalEl.textContent = totalProducts;
        if (lowEl) lowEl.textContent = lowStock;

        // Fetch sold today & this week from inventory_transactions
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const weekAgo = new Date();
            weekAgo.setDate(weekAgo.getDate() - 7);
            weekAgo.setHours(0, 0, 0, 0);

            const { data: txs, error } = await client
                .from('inventory_transactions')
                .select('*')
                .eq('profile_id', pid)
                .eq('type', 'sale')
                .gte('created_at', weekAgo.toISOString());

            if (!error && txs) {
                let soldToday = 0;
                let soldWeek = 0;
                
                txs.forEach(tx => {
                    const absQty = Math.abs(Number(tx.quantity_change) || 0);
                    soldWeek += absQty;
                    if (new Date(tx.created_at) >= today) {
                        soldToday += absQty;
                    }
                });

                const soldTodayEl = document.getElementById('kpiSoldToday');
                const soldWeekEl = document.getElementById('kpiSoldWeek');
                if (soldTodayEl) soldTodayEl.textContent = soldToday;
                if (soldWeekEl) soldWeekEl.textContent = soldWeek;
            }
        } catch (err) {
            console.error('KPI calculation error:', err);
        }
    }

    function renderTable() {
        if (!inventoryTableBody) return;
        const query = (searchInput?.value || '').toLowerCase().trim();
        const filtered = inventoryData.filter(item => 
            (item.name || '').toLowerCase().includes(query) || 
            (item.category || '').toLowerCase().includes(query) ||
            (item.hsn_code || '').toLowerCase().includes(query)
        );

        if (filtered.length === 0) {
            inventoryTableBody.innerHTML = '<tr><td colspan="6" class="empty">No products found in inventory.</td></tr>';
            return;
        }

        inventoryTableBody.innerHTML = filtered.map(item => {
            let statusHtml = '';
            const stockNum = Number(item.stock) || 0;
            const thresh = Number(item.low_stock_threshold) || 5;

            if (stockNum <= 0) {
                statusHtml = '<span class="stock-tag stock-out">Out of Stock</span>';
            } else if (stockNum <= thresh) {
                statusHtml = '<span class="stock-tag stock-low">Low Stock</span>';
            } else {
                statusHtml = '<span class="stock-tag stock-ok">In Stock</span>';
            }

            return `
                <tr>
                    <td style="font-weight:600; color:#172033;">${item.name}</td>
                    <td style="color:#718096; font-size:11px;">
                        ${item.category || '-'}${item.hsn_code ? `<br><span style="font-size:10px; color:#4a5568; font-weight:600;">HSN: ${item.hsn_code}</span>` : ''}
                    </td>
                    <td>
                        ₹${item.price || 0}${Number(item.gst_rate) > 0 ? `<br><span style="font-size:10px; color:#16a34a; font-weight:600;">GST: ${Number(item.gst_rate)}%</span>` : ''}
                    </td>
                    <td style="font-weight:600;">${stockNum}</td>
                    <td>${statusHtml}</td>
                    <td>
                        <button class="action-icon-btn edit-btn" data-id="${item.id}">✏️ Edit</button>
                        <button class="action-icon-btn restock-btn" data-id="${item.id}">📦 Restock</button>
                        <button class="action-icon-btn delete-btn" data-id="${item.id}" style="color:#dc2626;">🗑️ Delete</button>
                    </td>
                </tr>
            `;
        }).join('');

        // Attach listeners
        document.querySelectorAll('.edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                openModal(id);
            });
        });

        document.querySelectorAll('.restock-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const qtyStr = prompt('Enter quantity to add to stock:');
                if (qtyStr !== null && qtyStr.trim() !== '') {
                    const qty = Number(qtyStr);
                    if (!isNaN(qty) && qty > 0) {
                        await handleRestock(id, qty);
                    } else {
                        alert('Please enter a valid positive number.');
                    }
                }
            });
        });

        document.querySelectorAll('.delete-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const item = inventoryData.find(i => i.id === id);
                if (confirm(`Are you sure you want to delete ${item ? item.name : 'this product'}?`)) {
                    await handleDelete(id);
                }
            });
        });
    }

    async function handleRestock(id, qtyToAdd) {
        const pid = await ensureProfile();
        const item = inventoryData.find(i => i.id === id);
        if (!item || !pid) return;

        const newStock = (Number(item.stock) || 0) + qtyToAdd;

        try {
            const { error: updErr } = await client
                .from('inventory')
                .update({ stock: newStock })
                .eq('id', id);
            
            if (updErr) throw updErr;

            // Log restock transaction
            await client.from('inventory_transactions').insert([{
                profile_id: pid,
                inventory_id: id,
                quantity_change: qtyToAdd,
                type: 'restock'
            }]);

            await loadInventory();
        } catch(err) {
            alert('Restock failed: ' + (err.message || err));
        }
    }

    async function handleDelete(id) {
        try {
            const { error } = await client
                .from('inventory')
                .delete()
                .eq('id', id);

            if (error) throw error;
            await loadInventory();
        } catch (err) {
            alert('Delete failed: ' + (err.message || err));
        }
    }

    function openModal(id = null) {
        if (id) {
            const item = inventoryData.find(i => i.id === id);
            if (!item) return;
            modalTitle.textContent = 'Edit Product';
            prodId.value = item.id;
            prodName.value = item.name || '';
            prodCategory.value = item.category || '';
            if (prodHsn) prodHsn.value = item.hsn_code || '';
            prodPrice.value = item.price || 0;
            if (prodGstRate) prodGstRate.value = item.gst_rate ?? 0;
            prodStock.value = item.stock || 0;
            prodThreshold.value = item.low_stock_threshold || 5;
        } else {
            modalTitle.textContent = 'Add New Product';
            prodId.value = '';
            prodName.value = '';
            prodCategory.value = '';
            if (prodHsn) prodHsn.value = '';
            prodPrice.value = '';
            if (prodGstRate) prodGstRate.value = '0';
            prodStock.value = '';
            prodThreshold.value = '5';
        }
        productModal.classList.add('active');
    }

    function closeModal() {
        productModal.classList.remove('active');
    }

    async function saveProduct() {
        const pid = await ensureProfile();
        if (!pid) {
            alert('You must be logged in to manage inventory.');
            return;
        }

        const name = prodName.value.trim();
        const category = prodCategory.value.trim();
        const hsn_code = prodHsn ? prodHsn.value.trim() : null;
        const price = Number(prodPrice.value) || 0;
        const gst_rate = Number(prodGstRate?.value) || 0;
        const stock = Number(prodStock.value) || 0;
        const thresh = Number(prodThreshold.value) || 5;

        if (!name) return alert('Product name is required.');

        prodSave.disabled = true;
        prodSave.textContent = 'Saving...';

        try {
            const payload = {
                profile_id: pid,
                name,
                category,
                hsn_code: hsn_code || null,
                price,
                gst_rate,
                stock,
                low_stock_threshold: thresh
            };

            if (prodId.value) {
                // Update
                const { error } = await client
                    .from('inventory')
                    .update(payload)
                    .eq('id', prodId.value);
                if (error) throw error;
            } else {
                // Insert
                const { data: newProd, error } = await client
                    .from('inventory')
                    .insert([payload])
                    .select()
                    .single();
                if (error) throw error;

                // Log initial stock as restock transaction
                if (stock > 0 && newProd) {
                    await client.from('inventory_transactions').insert([{
                        profile_id: pid,
                        inventory_id: newProd.id,
                        quantity_change: stock,
                        type: 'restock'
                    }]);
                }
            }
            
            closeModal();
            await loadInventory();
        } catch (err) {
            alert('Error saving product: ' + (err.message || err));
        } finally {
            prodSave.disabled = false;
            prodSave.textContent = 'Save Product';
        }
    }

    // Event Listeners
    if (addProductBtn) addProductBtn.addEventListener('click', () => openModal());
    if (refreshBtn) refreshBtn.addEventListener('click', loadInventory);
    if (searchInput) searchInput.addEventListener('input', renderTable);
    if (prodCancel) prodCancel.addEventListener('click', closeModal);
    if (prodSave) prodSave.addEventListener('click', saveProduct);

    // Initial Load
    await loadInventory();
});
