import sys

path = 'C:/Users/SHIHAAM/OneDrive/Desktop/salonautopart2/frontend/dashboard.html'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

replacement = '''<button class="refresh-btn" id="newWalkinBtn" style="background: #38a169; margin-right: 8px;">
                        ? &nbsp; New Walk-in
                    </button>
                    <button class="refresh-btn" id="refreshBtn">'''
content = content.replace('<button class="refresh-btn" id="refreshBtn">', replacement)

modal_html = '''
    <!-- ================= WALK-IN MODAL ================= -->
    <style>
        .walkin-modal-overlay {
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.2s ease;
        }
        .walkin-modal-overlay.active {
            opacity: 1;
            pointer-events: all;
        }
        .walkin-modal {
            background: white;
            width: 400px;
            border-radius: 14px;
            padding: 24px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            transform: translateY(20px);
            transition: transform 0.2s ease;
        }
        .walkin-modal-overlay.active .walkin-modal {
            transform: translateY(0);
        }
        .walkin-modal h2 {
            font-size: 18px;
            margin-bottom: 16px;
            color: #121923;
        }
        .walkin-form-group {
            margin-bottom: 12px;
        }
        .walkin-form-group label {
            display: block;
            font-size: 12px;
            font-weight: 600;
            color: #718096;
            margin-bottom: 4px;
        }
        .walkin-form-group input, .walkin-form-group select {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #dce1e7;
            border-radius: 8px;
            outline: none;
            font-size: 13px;
        }
        .walkin-modal-actions {
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-top: 20px;
        }
        .walkin-btn-cancel {
            background: #f1f5f9;
            color: #475569;
            border: none;
            padding: 10px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
        }
        .walkin-btn-save {
            background: #38a169;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
        }
    </style>

    <div class="walkin-modal-overlay" id="walkinModal">
        <div class="walkin-modal">
            <h2>New Walk-in Booking</h2>
            <div class="walkin-form-group">
                <label>Customer Name *</label>
                <input type="text" id="walkinName" placeholder="John Doe">
            </div>
            <div class="walkin-form-group">
                <label>Phone Number</label>
                <input type="text" id="walkinPhone" placeholder="e.g. 9876543210">
            </div>
            <div class="walkin-form-group">
                <label>Service *</label>
                <input type="text" id="walkinService" placeholder="e.g. Haircut">
            </div>
            <div style="display:flex; gap:12px;">
                <div class="walkin-form-group" style="flex:1;">
                    <label>Date</label>
                    <input type="date" id="walkinDate">
                </div>
                <div class="walkin-form-group" style="flex:1;">
                    <label>Time</label>
                    <input type="time" id="walkinTime">
                </div>
            </div>
            <div class="walkin-modal-actions">
                <button class="walkin-btn-cancel" id="walkinCancel">Cancel</button>
                <button class="walkin-btn-save" id="walkinSave">Save Booking</button>
            </div>
        </div>
    </div>

    <!-- ================= LIBRARIES ================= -->
'''

content = content.replace('<!-- ================= LIBRARIES ================= -->', modal_html)

js_html = '''
        document.addEventListener("DOMContentLoaded", function () {
            // Walk-in Modal Logic
            const newWalkinBtn = document.getElementById("newWalkinBtn");
            const walkinModal = document.getElementById("walkinModal");
            const walkinCancel = document.getElementById("walkinCancel");
            const walkinSave = document.getElementById("walkinSave");

            if (newWalkinBtn) {
                newWalkinBtn.addEventListener("click", () => {
                    const today = new Date();
                    const tzoffset = today.getTimezoneOffset() * 60000;
                    const localISOTime = (new Date(today - tzoffset)).toISOString().slice(0, -1);
                    document.getElementById("walkinDate").value = localISOTime.split('T')[0];
                    document.getElementById("walkinTime").value = today.toTimeString().slice(0,5);
                    walkinModal.classList.add("active");
                });
            }

            if (walkinCancel) {
                walkinCancel.addEventListener("click", () => {
                    walkinModal.classList.remove("active");
                });
            }

            if (walkinSave) {
                walkinSave.addEventListener("click", async () => {
                    const name = document.getElementById("walkinName").value.trim();
                    const phone = document.getElementById("walkinPhone").value.trim();
                    const service = document.getElementById("walkinService").value.trim();
                    const date = document.getElementById("walkinDate").value;
                    const time = document.getElementById("walkinTime").value;

                    if (!name || !service || !date || !time) {
                        alert("Please fill in all required fields (*).");
                        return;
                    }

                    const profileId = localStorage.getItem("profileId");
                    
                    try {
                        walkinSave.textContent = "Saving...";
                        walkinSave.disabled = true;

                        const BACKEND_URL = window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost" 
                            ? "http://localhost:3000" 
                            : "https://saloon-zarah.onrender.com";

                        const response = await fetch(${BACKEND_URL}/api/bookings/manual, {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                                profile_id: profileId,
                                customer_name: name,
                                phone: phone,
                                service: service,
                                booking_date: date,
                                booking_time: time
                            })
                        });

                        const result = await response.json();
                        
                        if (!response.ok) {
                            throw new Error(result.error || "Failed to create booking");
                        }

                        walkinModal.classList.remove("active");
                        alert("Walk-in booking created successfully!");
                        
                        // Clear fields
                        document.getElementById("walkinName").value = "";
                        document.getElementById("walkinPhone").value = "";
                        document.getElementById("walkinService").value = "";

                        if (typeof loadBookings === "function") {
                            loadBookings();
                        } else {
                            window.location.reload();
                        }
                    } catch (error) {
                        console.error(error);
                        alert(error.message);
                    } finally {
                        walkinSave.textContent = "Save Booking";
                        walkinSave.disabled = false;
                    }
                });
            }

'''

content = content.replace('document.addEventListener("DOMContentLoaded", function () {', js_html)

with open(path, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done")
