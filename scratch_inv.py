import sys

path = r'C:\Users\SHIHAAM\OneDrive\Desktop\salonautopart2\frontend\inventory.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace title
content = content.replace("<title>BookFlow Dashboard</title>", "<title>BookFlow Inventory</title>")

# Active link logic
content = content.replace('class="active"', '') # strip all active
content = content.replace('<a href="inventory.html">', '<a href="inventory.html" class="active">')

# Extract main content replacement
start_main = '<div class="main">'
end_main = '<!-- ================= LIBRARIES ================= -->'

if start_main in content and end_main in content:
    pre = content[:content.find(start_main)]
    post = content[content.find(end_main):]
    
    new_main = """<div class="main">
            <div class="topbar">
                <div class="welcome">
                    <h1>Inventory <span>Management</span></h1>
                    <p>Track your salon's product stock and retail items.</p>
                </div>
                <div class="top-actions">
                    <button class="refresh-btn" id="addProductBtn" style="background: #38a169;">
                        ? &nbsp; Add Product
                    </button>
                    <button class="refresh-btn" id="refreshBtn">
                        ?? &nbsp; Refresh
                    </button>
                </div>
            </div>

            <!-- ================= KPI ================= -->
            <div class="kpis">
                <div class="kpi">
                    <div class="kpi-icon purple">??</div>
                    <div>
                        <div class="kpi-label">Total Products</div>
                        <div class="kpi-value" id="kpiTotalProducts">0</div>
                    </div>
                </div>
                <div class="kpi">
                    <div class="kpi-icon pink">??</div>
                    <div>
                        <div class="kpi-label">Low Stock</div>
                        <div class="kpi-value" id="kpiLowStock">0</div>
                        <div class="kpi-muted">Items running out</div>
                    </div>
                </div>
                <div class="kpi">
                    <div class="kpi-icon green">??</div>
                    <div>
                        <div class="kpi-label">Sold Today</div>
                        <div class="kpi-value" id="kpiSoldToday">0</div>
                    </div>
                </div>
                <div class="kpi">
                    <div class="kpi-icon yellow">??</div>
                    <div>
                        <div class="kpi-label">Sold This Week</div>
                        <div class="kpi-value" id="kpiSoldWeek">0</div>
                    </div>
                </div>
            </div>

            <!-- ================= INVENTORY TABLE ================= -->
            <div class="card">
                <div class="card-header">
                    <div class="card-title">Available Inventory</div>
                    <div class="table-tools">
                        <input type="text" class="search" id="inventorySearch" placeholder="Search products...">
                    </div>
                </div>
                <div class="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>PRODUCT NAME</th>
                                <th>CATEGORY</th>
                                <th>PRICE</th>
                                <th>STOCK</th>
                                <th>STATUS</th>
                                <th>ACTIONS</th>
                            </tr>
                        </thead>
                        <tbody id="inventoryTableBody">
                            <tr>
                                <td colspan="6" class="empty">Loading inventory...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    </div>

    <!-- Modals -->
    <style>
        .modal-overlay {
            position: fixed; top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.5); display: flex; align-items: center; justify-content: center;
            z-index: 9999; opacity: 0; pointer-events: none; transition: opacity 0.2s ease;
        }
        .modal-overlay.active { opacity: 1; pointer-events: all; }
        .modal-card {
            background: white; width: 400px; border-radius: 14px; padding: 24px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1); transform: translateY(20px); transition: transform 0.2s ease;
        }
        .modal-overlay.active .modal-card { transform: translateY(0); }
        .modal-card h2 { font-size: 18px; margin-bottom: 16px; color: #121923; }
        .form-group { margin-bottom: 12px; }
        .form-group label { display: block; font-size: 12px; font-weight: 600; color: #718096; margin-bottom: 4px; }
        .form-group input { width: 100%; padding: 10px 12px; border: 1px solid #dce1e7; border-radius: 8px; outline: none; font-size: 13px; }
        .modal-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
        .btn-cancel { background: #f1f5f9; color: #475569; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; }
        .btn-save { background: #38a169; color: white; border: none; padding: 10px 16px; border-radius: 8px; cursor: pointer; font-weight: 600; }
        
        .stock-tag { padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: bold; }
        .stock-ok { background: #eaf8ee; color: #24945a; }
        .stock-low { background: #fff4df; color: #c48517; }
        .stock-out { background: #ffe9e9; color: #d94b4b; }
        .action-icon-btn { border: none; background: #f1f5f9; border-radius: 6px; padding: 6px; cursor: pointer; font-size: 12px; margin-right: 4px;}
        .action-icon-btn:hover { background: #e2e8f0; }
    </style>

    <div class="modal-overlay" id="productModal">
        <div class="modal-card">
            <h2 id="modalTitle">Add New Product</h2>
            <input type="hidden" id="prodId">
            <div class="form-group">
                <label>Product Name *</label>
                <input type="text" id="prodName" placeholder="e.g. L'Oreal Shampoo">
            </div>
            <div class="form-group">
                <label>Category</label>
                <input type="text" id="prodCategory" placeholder="e.g. Hair Care">
            </div>
            <div style="display:flex; gap:12px;">
                <div class="form-group" style="flex:1;">
                    <label>Price (?) *</label>
                    <input type="number" id="prodPrice" placeholder="0">
                </div>
                <div class="form-group" style="flex:1;">
                    <label>Initial Stock *</label>
                    <input type="number" id="prodStock" placeholder="0">
                </div>
            </div>
            <div class="form-group">
                <label>Low Stock Alert Threshold</label>
                <input type="number" id="prodThreshold" placeholder="5">
            </div>
            <div class="modal-actions">
                <button class="btn-cancel" id="prodCancel">Cancel</button>
                <button class="btn-save" id="prodSave">Save Product</button>
            </div>
        </div>
    </div>
"""
    
    with open(path, 'w', encoding='utf-8') as f:
        f.write(pre + new_main + "\n    " + post)
