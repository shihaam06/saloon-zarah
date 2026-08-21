let booking = null;

let addons = [];

let selectedProducts = [];

let inventoryProducts = [];

let selectedPayment = null;

let profileSettings = null;

let mainService = null;


// ==========================================
// GET BOOKING ID
// ==========================================

const params =
    new URLSearchParams(
        window.location.search
    );

const bookingId =
    params.get("booking");


// ==========================================
// LOAD BOOKING
// ==========================================

async function loadBooking() {

    if (!bookingId) {

        alert(
            "No booking selected."
        );

        history.back();

        return;

    }


    const {
        data: {
            user
        }
    } =
        await client.auth.getUser();


    if (!user) {

        window.location.href =
            "login.html";

        return;

    }


    // ======================================
    // LOAD BOOKING
    // ======================================

    const {
        data,
        error
    } =
        await client

            .from("bookings")

            .select("*")

            .eq(
                "id",
                bookingId
            )

            .eq(
                "profile_id",
                user.id
            )

            .single();


    if (error) {

        console.error(error);

        alert(
            "Unable to load booking."
        );

        history.back();

        return;

    }


    booking = data;


    // ======================================
    // LOAD PROFILE / GST SETTINGS
    // ======================================

    const {
        data: profile,
        error: profileError
    } =
        await client

            .from("profiles")

            .select(`
                business_name,
                business_address,
                business_phone,
                gst_enabled,
                gstin,
                business_state,
                state_code,
                invoice_prefix,
                next_invoice_number
            `)

            .eq(
                "id",
                user.id
            )

            .single();


    if (profileError) {

        console.error(
            "Profile loading error:",
            profileError
        );

    }


    profileSettings =
        profile || {};


    // ======================================
    // FIND MAIN SERVICE
    // ======================================

    await loadMainService();

    // ======================================
    // LOAD INVENTORY PRODUCTS
    // ======================================

    await loadInventoryProducts();

    // ======================================
    // LOAD STAFF LIST (for line-item attribution)
    // ======================================

    await loadStaffList();


    renderBooking();
    // ======================================
// INITIALIZE PAYMENT AMOUNT
// ======================================

const amountInput =
    document.getElementById(
        "amountReceived"
    );

if (amountInput) {

    const total =
        Number(
            calculateTotal().total
        ) || 0;

    const advance =
        Number(
            booking?.advance_paid
        ) || 0;

    const remaining =
        Math.max(
            total - advance,
            0
        );

    amountInput.value =
        remaining.toFixed(2);

}

}


// ==========================================
// LOAD MAIN SERVICE FROM SERVICES TABLE
// ==========================================

async function loadMainService() {

    if (!booking?.service) {

        mainService = null;

        return;

    }


    const serviceName =
        booking.service.trim();


    const {
        data,
        error
    } =
        await client

            .from("services")

            .select("*")

            .eq(
                "profile_id",
                booking.profile_id
            )

            .ilike(
                "name",
                serviceName
            )

            .eq(
                "active",
                true
            )
            
            .limit(1)
            
            .maybeSingle();


    if (error) {

        console.error(
            "Service lookup error:",
            error
        );

        mainService = null;

        return;

    }


    mainService = data;


    if (!mainService) {

        console.warn(
            "Service not found in services table:",
            serviceName
        );

    }

}


// ==========================================
// LOAD INVENTORY PRODUCTS FROM DATABASE
// ==========================================

async function loadInventoryProducts() {
    try {
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;

        const { data, error } = await client
            .from("inventory")
            .select("*")
            .eq("profile_id", user.id)
            .order("name", { ascending: true });

        if (!error && data) {
            inventoryProducts = data;
        }
    } catch (err) {
        console.error("Error loading inventory for billing:", err);
    }
}


// ==========================================
// STAFF LIST FOR LINE-ITEM ATTRIBUTION
// ==========================================

let staffList = [];

async function loadStaffList() {
    try {
        const { data: { user } } = await client.auth.getUser();
        if (!user) return;

        const { data, error } = await client
            .from("staff")
            .select("id, name")
            .eq("profile_id", user.id)
            .eq("active", true)
            .order("name", { ascending: true });

        if (!error && data) {
            staffList = data;
        }
    } catch (err) {
        console.error("Error loading staff for billing:", err);
    }
}

function buildStaffOptions(selectedId = "") {
    let opts = `<option value="">— Assign Staff —</option>`;
    staffList.forEach(s => {
        opts += `<option value="${s.id}" ${s.id === selectedId ? "selected" : ""}>${escapeHtml(s.name)}</option>`;
    });
    return opts;
}


// ==========================================
// RENDER BOOKING
// ==========================================

function renderBooking() {

    document.getElementById(
        "customerName"
    ).textContent =
        booking.customer_name ||
        "-";


    document.getElementById(
        "customerPhone"
    ).textContent =
        booking.phone ||
        "-";


    document.getElementById(
        "bookingIdDisplay"
    ).textContent =
        booking.id;


    let appointmentText =
        "-";


    if (
        booking.booking_date
    ) {

        appointmentText =
            new Date(
                booking.booking_date
            ).toLocaleDateString(
                "en-IN",
                {
                    day: "2-digit",
                    month: "short",
                    year: "numeric"
                }
            );

    }


    if (
        booking.booking_time
    ) {

        appointmentText +=
            " • " +
            new Date(
                `1970-01-01T${booking.booking_time}`
            ).toLocaleTimeString(
                [],
                {
                    hour: "numeric",
                    minute: "2-digit"
                }
            );

    }


    document.getElementById(
        "appointmentDate"
    ).textContent =
        appointmentText;


    renderServices();

    calculateTotal();

}


// ==========================================
// SERVICES
// ==========================================

function renderServices() {

    const container =
        document.getElementById(
            "servicesContainer"
        );


    if (!mainService) {

        container.innerHTML = `

            <div class="service-row">

                <div>

                    <div class="service-name">
                        ${booking.service || "Service"}
                    </div>

                    <div
                        class="label"
                        style="margin-top:5px;color:#dc2626"
                    >
                        Service not found in Services.
                        Please add it before billing.
                    </div>

                </div>

                <div class="service-price">
                    ₹0
                </div>

            </div>

        `;

        return;

    }


    const price =
        Number(
            mainService.price
        ) || 0;


    const gstRate =
        Number(
            mainService.gst_rate
        ) || 0;


    container.innerHTML = `

        <div class="service-row">

            <div>

                <div class="service-name">
                    ${mainService.name}
                </div>

                <div
                    class="label"
                    style="margin-top:5px"
                >
                    ${mainService.item_type === "product"
                        ? "Product"
                        : "Service"
                    }

                    ${
                        mainService.hsn_sac
                        ? ` • HSN/SAC: ${mainService.hsn_sac}`
                        : ""
                    }

                    ${
                        profileSettings?.gst_enabled
                        ? ` • GST ${gstRate}%`
                        : ""
                    }

                </div>

                <div style="margin-top:8px;">
                    <select id="mainServiceStaff" style="font-size:13px;padding:5px 8px;border:1px solid #e2e8f0;border-radius:6px;background:#f8fafc;color:#334155;min-width:160px;" onchange="mainServiceStaffId=this.value">
                        ${buildStaffOptions()}
                    </select>
                </div>

            </div>

            <div class="service-price">

                ₹${price.toLocaleString(
                    "en-IN",
                    {
                        minimumFractionDigits: 2
                    }
                )}

            </div>

        </div>

    `;

}

let mainServiceStaffId = "";


// ==========================================
// ADD ADDON
// ==========================================

document
    .getElementById("addAddonBtn")
    .addEventListener(
        "click",
        () => {

            addons.push({

                name: "",

                price: 0,

                gstRate: 0,

                hsnSac: ""

            });


            renderAddons();

        }
    );


// ==========================================
// RENDER ADDONS
// ==========================================

function renderAddons() {

    const container =
        document.getElementById(
            "addonsContainer"
        );


    container.innerHTML = "";


    addons.forEach(
        (addon, index) => {

            container.innerHTML += `

                <div
                    class="addon-row"
                    data-index="${index}"
                >

                    <input
                        type="text"
                        placeholder="Add-on name"
                        value="${escapeHtml(addon.name)}"
                        class="addon-name"
                    >

                    <input
                        type="number"
                        placeholder="Amount"
                        value="${addon.price}"
                        min="0"
                        step="0.01"
                        class="addon-price"
                    >

                    <input
                        type="number"
                        placeholder="GST %"
                        value="${addon.gstRate}"
                        min="0"
                        max="100"
                        step="0.01"
                        class="addon-gst"
                    >

                    <input
                        type="text"
                        placeholder="HSN/SAC"
                        value="${escapeHtml(addon.hsnSac)}"
                        class="addon-hsn"
                    >

                    <select class="addon-staff" style="height:42px; padding:0 8px; border:1px solid #dce1e7; border-radius:8px; font-size:12px; font-weight:600; color:#334155; background:#fff;">
                        ${buildStaffOptions(addon.staff_id || "")}
                    </select>

                    <button
                        class="remove-btn"
                        onclick="removeAddon(${index})"
                    >
                        Remove
                    </button>

                </div>

            `;

        }
    );


    // ======================================
    // NAME
    // ======================================

    document
        .querySelectorAll(
            ".addon-name"
        )
        .forEach(
            (input, index) => {

                input.addEventListener(
                    "input",
                    () => {

                        addons[index].name =
                            input.value;

                    }
                );

            }
        );


    // ======================================
    // PRICE
    // ======================================

    document
        .querySelectorAll(
            ".addon-price"
        )
        .forEach(
            (input, index) => {

                input.addEventListener(
                    "input",
                    () => {

                        addons[index].price =
                            Number(
                                input.value
                            ) || 0;

                        calculateTotal();

                    }
                );

            }
        );


    // ======================================
    // GST
    // ======================================

    document
        .querySelectorAll(
            ".addon-gst"
        )
        .forEach(
            (input, index) => {

                input.addEventListener(
                    "input",
                    () => {

                        addons[index].gstRate =
                            Number(
                                input.value
                            ) || 0;

                        calculateTotal();

                    }
                );

            }
        );


    // ======================================
    // HSN / SAC
    // ======================================

    document
        .querySelectorAll(
            ".addon-hsn"
        )
        .forEach(
            (input, index) => {

                input.addEventListener(
                    "input",
                    () => {

                        addons[index].hsnSac =
                            input.value;

                    }
                );

            }
        );

    // ======================================
    // STAFF
    // ======================================

    document
        .querySelectorAll(
            ".addon-staff"
        )
        .forEach(
            (select, index) => {

                select.addEventListener(
                    "change",
                    () => {

                        addons[index].staff_id =
                            select.value || null;

                    }
                );

            }
        );

}


// ==========================================
// REMOVE ADDON
// ==========================================

function removeAddon(index) {

    addons.splice(
        index,
        1
    );

    renderAddons();

    calculateTotal();

}


// ==========================================
// ADD PRODUCT
// ==========================================

document
    .getElementById("addProductItemBtn")
    ?.addEventListener("click", () => {
        if (inventoryProducts.length === 0) {
            alert("No products available in inventory. Please add products in the Inventory page first.");
            return;
        }

        const firstProd = inventoryProducts[0];
        selectedProducts.push({
            inventory_id: firstProd.id,
            name: firstProd.name,
            price: Number(firstProd.price) || 0,
            quantity: 1,
            gstRate: 0,
            hsnSac: "",
            maxStock: Number(firstProd.stock) || 0
        });

        renderProducts();
        calculateTotal();
    });


// ==========================================
// RENDER PRODUCTS
// ==========================================

function renderProducts() {
    const container = document.getElementById("productsContainer");
    if (!container) return;

    container.innerHTML = "";

    selectedProducts.forEach((prod, index) => {
        let optionsHtml = `<option value="">Select a product...</option>`;
        inventoryProducts.forEach(inv => {
            const isSelected = inv.id === prod.inventory_id ? "selected" : "";
            optionsHtml += `<option value="${inv.id}" ${isSelected}>${escapeHtml(inv.name)} (Stock: ${inv.stock || 0}) - ₹${inv.price || 0}</option>`;
        });

        container.innerHTML += `
            <div class="addon-row product-row" data-index="${index}" style="display:flex; gap:10px; margin-bottom:12px; align-items:center; flex-wrap:wrap;">
                <select class="product-select" style="flex:2; min-width:180px; height:42px; padding:0 12px; border:1px solid #dce1e7; border-radius:8px; font-size:12px; font-weight:600; color:#334155; background:#fff;">
                    ${optionsHtml}
                </select>

                <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:110px;">
                    <span style="font-size:11px; font-weight:700; color:#718096;">Qty:</span>
                    <input type="number" min="1" max="${prod.maxStock || 999}" value="${prod.quantity}" class="product-qty" style="width:100%; height:42px; padding:0 10px; border:1px solid #dce1e7; border-radius:8px; font-size:12px; font-weight:600; color:#334155; background:#fff;">
                </div>

                <div style="display:flex; align-items:center; gap:6px; flex:1; min-width:110px;">
                    <span style="font-size:11px; font-weight:700; color:#718096;">₹</span>
                    <input type="number" step="0.01" value="${prod.price}" class="product-price" style="width:100%; height:42px; padding:0 10px; border:1px solid #dce1e7; border-radius:8px; font-size:12px; font-weight:600; color:#334155; background:#fff;">
                </div>

                <select class="product-staff" style="height:42px; padding:0 8px; border:1px solid #dce1e7; border-radius:8px; font-size:12px; font-weight:600; color:#334155; background:#fff;">
                    ${buildStaffOptions(prod.staff_id || "")}
                </select>

                <button type="button" class="remove-btn" onclick="removeProduct(${index})" style="height:42px; padding:0 14px; background:#fee2e2; color:#dc2626; border:none; border-radius:8px; cursor:pointer; font-size:11px; font-weight:700;">
                    Remove
                </button>
            </div>
        `;
    });

    // Attach listeners
    document.querySelectorAll(".product-select").forEach((sel, idx) => {
        sel.addEventListener("change", (e) => {
            const invId = e.target.value;
            const inv = inventoryProducts.find(i => i.id === invId);
            if (inv) {
                selectedProducts[idx].inventory_id = inv.id;
                selectedProducts[idx].name = inv.name;
                selectedProducts[idx].price = Number(inv.price) || 0;
                selectedProducts[idx].maxStock = Number(inv.stock) || 0;
                renderProducts();
                calculateTotal();
            }
        });
    });

    document.querySelectorAll(".product-qty").forEach((input, idx) => {
        input.addEventListener("input", () => {
            const val = Number(input.value) || 1;
            selectedProducts[idx].quantity = Math.max(1, val);
            calculateTotal();
        });
    });

    document.querySelectorAll(".product-price").forEach((input, idx) => {
        input.addEventListener("input", () => {
            selectedProducts[idx].price = Number(input.value) || 0;
            calculateTotal();
        });
    });

    document.querySelectorAll(".product-staff").forEach((sel, idx) => {
        sel.addEventListener("change", (e) => {
            selectedProducts[idx].staff_id = e.target.value || null;
        });
    });
}


// ==========================================
// REMOVE PRODUCT
// ==========================================

function removeProduct(index) {
    selectedProducts.splice(index, 1);
    renderProducts();
    calculateTotal();
}
window.removeProduct = removeProduct;


// ==========================================
// DISCOUNT
// ==========================================

document
    .getElementById("discount")
    .addEventListener(
        "input",
        calculateTotal
    );


// ==========================================
// CALCULATE GST FOR ITEM
// ==========================================

function calculateItemTax(
    price,
    gstRate
) {

    price =
        Number(price) || 0;

    gstRate =
        Number(gstRate) || 0;


    const tax =
        price *
        gstRate /
        100;


    const cgst =
        tax / 2;


    const sgst =
        tax / 2;


    return {

        taxableAmount:
            price,

        taxAmount:
            tax,

        cgstAmount:
            cgst,

        sgstAmount:
            sgst,

        igstAmount:
            0

    };

}


// ==========================================
// CALCULATE TOTAL
// ==========================================

function calculateTotal() {

    const subtotal =
        Number(
            mainService?.price
        ) || 0;


    const addonTotal =
        addons.reduce(
            (
                sum,
                addon
            ) => {

                return sum +
                    (
                        Number(
                            addon.price
                        ) || 0
                    );

            },
            0
        );


    const productTotal =
        selectedProducts.reduce(
            (
                sum,
                prod
            ) => {

                return sum +
                    (
                        (Number(prod.price) || 0) *
                        (Number(prod.quantity) || 1)
                    );

            },
            0
        );


    const discount =
        Number(
            document.getElementById(
                "discount"
            )?.value
        ) || 0;


    const grossAmount =
        Math.max(
            0,
            subtotal +
            addonTotal +
            productTotal
        );


    /*
     * Discount is deducted before GST.
     *
     * For now, the discount is distributed
     * proportionally across the items.
     */


    const discountRatio =
        grossAmount > 0
            ? Math.min(
                discount /
                grossAmount,
                1
            )
            : 0;


    // ======================================
    // MAIN SERVICE TAX
    // ======================================

    const mainGST =
        profileSettings?.gst_enabled
            ? Number(
                mainService?.gst_rate
            ) || 0
            : 0;


    const mainDiscount =
        subtotal *
        discountRatio;


    const mainTaxable =
        Math.max(
            0,
            subtotal -
            mainDiscount
        );


    const mainTax =
        calculateItemTax(
            mainTaxable,
            mainGST
        );


    // ======================================
    // ADDON TAX
    // ======================================

    let addonTaxTotal = 0;

    let addonCGST = 0;

    let addonSGST = 0;


    addons.forEach(
        addon => {

            const addonPrice =
                Number(
                    addon.price
                ) || 0;


            const addonDiscount =
                addonPrice *
                discountRatio;


            const addonTaxable =
                Math.max(
                    0,
                    addonPrice -
                    addonDiscount
                );


            const addonGST =
                profileSettings?.gst_enabled
                    ? Number(
                        addon.gstRate
                    ) || 0
                    : 0;


            const tax =
                calculateItemTax(
                    addonTaxable,
                    addonGST
                );


            addonTaxTotal +=
                tax.taxAmount;


            addonCGST +=
                tax.cgstAmount;


            addonSGST +=
                tax.sgstAmount;

        }
    );


    // ======================================
    // PRODUCT TAX
    // ======================================

    let productTaxTotal = 0;

    let productCGST = 0;

    let productSGST = 0;


    selectedProducts.forEach(
        prod => {

            const prodPrice =
                (Number(prod.price) || 0) *
                (Number(prod.quantity) || 1);


            const prodDiscount =
                prodPrice *
                discountRatio;


            const prodTaxable =
                Math.max(
                    0,
                    prodPrice -
                    prodDiscount
                );


            const prodGST =
                profileSettings?.gst_enabled
                    ? Number(
                        prod.gstRate
                    ) || 0
                    : 0;


            const tax =
                calculateItemTax(
                    prodTaxable,
                    prodGST
                );


            productTaxTotal +=
                tax.taxAmount;


            productCGST +=
                tax.cgstAmount;


            productSGST +=
                tax.sgstAmount;

        }
    );


    // ======================================
    // TOTALS
    // ======================================

    const taxableAmount =
        mainTaxable +
        addons.reduce(
            (
                sum,
                addon
            ) => {

                const addonPrice =
                    Number(
                        addon.price
                    ) || 0;


                const addonDiscount =
                    addonPrice *
                    discountRatio;


                return sum +
                    Math.max(
                        0,
                        addonPrice -
                        addonDiscount
                    );

            },
            0
        ) +
        selectedProducts.reduce(
            (
                sum,
                prod
            ) => {

                const prodPrice =
                    (Number(prod.price) || 0) *
                    (Number(prod.quantity) || 1);


                const prodDiscount =
                    prodPrice *
                    discountRatio;


                return sum +
                    Math.max(
                        0,
                        prodPrice -
                        prodDiscount
                    );

            },
            0
        );


    const cgstAmount =
        mainTax.cgstAmount +
        addonCGST +
        productCGST;


    const sgstAmount =
        mainTax.sgstAmount +
        addonSGST +
        productSGST;


    const igstAmount =
        0;


    const totalTax =
        cgstAmount +
        sgstAmount +
        igstAmount;


    const total =
        Math.max(
            0,
            taxableAmount +
            totalTax
        );


    // ======================================
    // UPDATE UI
    // ======================================

    document.getElementById(
        "subtotal"
    ).textContent =
        "₹" +
        subtotal.toLocaleString(
            "en-IN",
            {
                minimumFractionDigits: 2
            }
        );


    document.getElementById(
        "addonTotal"
    ).textContent =
        "₹" +
        addonTotal.toLocaleString(
            "en-IN",
            {
                minimumFractionDigits: 2
            }
        );


    const prodEl =
        document.getElementById(
            "productTotal"
        );

    if (prodEl) {

        prodEl.textContent =
            "₹" +
            productTotal.toLocaleString(
                "en-IN",
                {
                    minimumFractionDigits: 2
                }
            );

    }


    document.getElementById(
        "discountTotal"
    ).textContent =
        "-₹" +
        discount.toLocaleString(
            "en-IN",
            {
                minimumFractionDigits: 2
            }
        );


    // ======================================
// GRAND TOTAL AFTER ADVANCE
// ======================================

const advancePaid =
    Number(booking?.advance_paid) || 0;

const finalAmount =
    Math.max(
        total - advancePaid,
        0
    );

const displayTotal =
    window.advanceDeducted
        ? Math.max(
            total - (Number(booking?.advance_paid) || 0),
            0
        )
        : total;

document.getElementById(
    "grandTotal"
).textContent =
    "₹" +
    displayTotal.toLocaleString(
        "en-IN",
        {
            minimumFractionDigits: 2
        }
    );


    /*
     * If these elements exist in your
     * billing HTML, update them.
     */

    const taxableElement =
        document.getElementById(
            "taxableAmount"
        );


    if(taxableElement){

        taxableElement.textContent =
            "₹" +
            taxableAmount.toLocaleString(
                "en-IN",
                {
                    minimumFractionDigits: 2
                }
            );

    }


    const cgstElement =
        document.getElementById(
            "cgstAmount"
        );


    if(cgstElement){

        cgstElement.textContent =
            "₹" +
            cgstAmount.toLocaleString(
                "en-IN",
                {
                    minimumFractionDigits: 2
                }
            );

    }


    const sgstElement =
        document.getElementById(
            "sgstAmount"
        );


    if(sgstElement){

        sgstElement.textContent =
            "₹" +
            sgstAmount.toLocaleString(
                "en-IN",
                {
                    minimumFractionDigits: 2
                }
            );

    }


    const totalTaxElement =
        document.getElementById(
            "totalTax"
        );


    if(totalTaxElement){

        totalTaxElement.textContent =
            "₹" +
            totalTax.toLocaleString(
                "en-IN",
                {
                    minimumFractionDigits: 2
                }
            );

    }


    return {

        subtotal,

        addonTotal,

        discount,

        taxableAmount,

        cgstAmount,

        sgstAmount,

        igstAmount,

        totalTax,

        total

    };

}
// ==========================================
// ADVANCE DEDUCTION TOGGLE
// ==========================================

document.addEventListener(
    "advanceChanged",
    () => {
        calculateTotal();
    }
);


// ==========================================
// PAYMENT METHOD
// ==========================================

document
    .querySelectorAll(
        ".payment-option"
    )
    .forEach(
        option => {

            option.addEventListener(
                "click",
                () => {

                    document
                        .querySelectorAll(
                            ".payment-option"
                        )
                        .forEach(
                            item =>
                                item.classList
                                    .remove(
                                        "active"
                                    )
                        );


                    option.classList.add(
                        "active"
                    );


                    selectedPayment =
                        option.dataset.payment;

                }
            );

        }
    );
    const amountReceivedInput =
    document.getElementById(
        "amountReceived"
    );

if(amountReceivedInput){

    const advance =
        Number(
            booking?.advance_paid
        ) || 0;

    const total =
        Number(
            calculateTotal().total
        ) || 0;

    const remaining =
        Math.max(
            total - advance,
            0
        );

    amountReceivedInput.value =
        remaining.toFixed(2);

}


// ==========================================
// GENERATE INVOICE NUMBER
// ==========================================

async function generateInvoiceNumber() {

    const prefix =
        profileSettings.invoice_prefix ||
        "INV-";


    const number =
        Number(
            profileSettings.next_invoice_number
        ) || 1;


    const invoiceNumber =
        prefix +
        String(
            number
        ).padStart(
            4,
            "0"
        );


    /*
     * Increment invoice number
     */

    const {
        error
    } =
        await client

            .from("profiles")

            .update({

                next_invoice_number:
                    number + 1

            })

            .eq(
                "id",
                booking.profile_id
            );


    if(error){

        console.error(
            "Invoice number update failed:",
            error
        );

    }


    return invoiceNumber;

}


// ==========================================
// PROCEED
// ==========================================

document
    .getElementById(
        "proceedBtn"
    )
    .addEventListener(
        "click",
        async () => {

            if (!selectedPayment) {

                alert(
                    "Please select a payment method."
                );

                return;

            }


            if (!mainService) {

                alert(
                    "This service is not configured in Services. Please add it first."
                );

                return;

            }


            const totals =
                calculateTotal();
                // ======================================
// ADVANCE PAYMENT FROM BOOKING
// ======================================

// const advancePaid =
//     Number(booking.advance_paid) || 0;

// const balanceDue =
//     Math.max(
//         totals.total - advancePaid,
//         0
//     );


            const validAddons =
                addons.filter(
                    addon =>
                        addon.name.trim()
                        &&
                        Number(
                            addon.price
                        ) > 0
                );


            const {
                data: {
                    user
                }
            } =
                await client.auth.getUser();


            if (!user) {

                alert(
                    "Session expired."
                );

                return;

            }


            // ======================================
            // INVOICE NUMBER
            // ======================================

            const invoiceNumber =
                await generateInvoiceNumber();


            // ======================================
            // CREATE BILL
            // ======================================

            // ======================================
// PAYMENT CALCULATION
// ======================================

// ======================================
// PAYMENT CALCULATION
// ======================================

const billTotal =
    Number(totals.total) || 0;


// Amount already received when booking was made
const bookingAdvance =
    Number(booking.advance_paid) || 0;


// Amount received NOW at billing
const amountInput =
    document.getElementById(
        "amountReceived"
    );


const remainingBeforePayment =
    Math.max(
        billTotal - bookingAdvance,
        0
    );

const currentPayment =
    Number(
        amountInput?.value
    ) || 0;

if(
    currentPayment >
    remainingBeforePayment
){

    alert(
        `Amount received cannot exceed the remaining balance of ₹${remainingBeforePayment.toFixed(2)}.`
    );

    return;
}

const amountPaid =
    bookingAdvance +
    currentPayment;

const balanceAmount =
    Math.max(
        billTotal -
        amountPaid,
        0
    );

let paymentStatus =
    "Pending";

if(
    amountPaid >= billTotal
){

    paymentStatus =
        "Paid";

}
else if(
    amountPaid > 0
){

    paymentStatus =
        "Partially Paid";

}


// const balanceAmount =
//     Math.max(
//         billTotal -
//         amountPaid,
//         0
//     );


// let paymentStatus =
//     "Pending";


if(amountPaid >= billTotal){

    paymentStatus =
        "Paid";

}
else if(amountPaid > 0){

    paymentStatus =
        "Partially Paid";

}


// ======================================
// UPDATE PAYMENT UI
// ======================================

const statusElement =
    document.getElementById(
        "paymentStatusDisplay"
    );


const balanceElement =
    document.getElementById(
        "balanceDueDisplay"
    );


if(statusElement){

    statusElement.textContent =
        paymentStatus;

}


if(balanceElement){

    balanceElement.textContent =
        "₹" +
        balanceAmount.toLocaleString(
            "en-IN",
            {
                minimumFractionDigits:2
            }
        );

}


// ======================================
// CREATE BILL
// ======================================

const {
    data: bill,
    error: billError
} = await client
    .from("bills")
    .insert({

        profile_id:
            user.id,

        booking_id:
            booking.id,

        customer_name:
            booking.customer_name,

        phone:
            booking.phone,

        subtotal:
            totals.subtotal,

        addon_total:
            totals.addonTotal,

        discount:
            totals.discount,

        taxable_amount:
            totals.taxableAmount,

        cgst_amount:
            totals.cgstAmount,

        sgst_amount:
            totals.sgstAmount,

        igst_amount:
            totals.igstAmount,

        total_tax:
            totals.totalTax,

        total:
            billTotal,

        invoice_number:
            invoiceNumber,

        invoice_date:
            new Date()
                .toISOString()
                .split("T")[0],

        seller_gstin:
            profileSettings.gstin ||
            null,

        seller_state:
            profileSettings.business_state ||
            null,

        seller_state_code:
            profileSettings.state_code ||
            null,

        // ==============================
        // PAYMENT
        // ==============================

        payment_method:
            selectedPayment,

        payment_status:
            paymentStatus,

        advance_paid:
    bookingAdvance,

amount_paid:
    amountPaid,

balance_amount:
    balanceAmount,

    })
    .select()
    .single();


            if (billError) {

                console.error(
                    billError
                );

                alert(
                    "Unable to create bill."
                );

                return;

            }


            // ======================================
            // BILL ITEMS
            // ======================================

            const items = [];


            // ======================================
            // MAIN SERVICE
            // ======================================

            const mainDiscount =
                totals.subtotal > 0
                    ? (
                        totals.subtotal /
                        (
                            totals.subtotal +
                            totals.addonTotal
                        )
                    ) *
                    totals.discount
                    : 0;


            const mainTaxableAmount =
                Math.max(
                    0,
                    totals.subtotal -
                    mainDiscount
                );


            const mainGST =
                profileSettings?.gst_enabled
                    ? Number(
                        mainService.gst_rate
                    ) || 0
                    : 0;


            const mainTax =
                calculateItemTax(
                    mainTaxableAmount,
                    mainGST
                );


            items.push({

                bill_id:
                    bill.id,

                item_name:
                    mainService.name,

                item_type:
                    mainService.item_type,

                quantity:
                    1,

                price:
                    Number(
                        mainService.price
                    ) || 0,

                total:
                    Number(
                        mainService.price
                    ) || 0,

                hsn_sac:
                    mainService.hsn_sac ||
                    null,

                gst_rate:
                    mainGST,

                taxable_amount:
                    mainTaxableAmount,

                cgst_amount:
                    mainTax.cgstAmount,

                sgst_amount:
                    mainTax.sgstAmount,

                igst_amount:
                    mainTax.igstAmount,

                tax_amount:
                    mainTax.taxAmount,

                staff_id:
                    mainServiceStaffId || null

            });


            // ======================================
            // ADDONS
            // ======================================

            validAddons.forEach(
                addon => {

                    const addonPrice =
                        Number(
                            addon.price
                        ) || 0;


                    const grossAmount =
                        totals.subtotal +
                        totals.addonTotal;


                    const addonDiscount =
                        grossAmount > 0
                            ? (
                                addonPrice /
                                grossAmount
                            ) *
                            totals.discount
                            : 0;


                    const addonTaxable =
                        Math.max(
                            0,
                            addonPrice -
                            addonDiscount
                        );


                    const addonGST =
                        profileSettings?.gst_enabled
                            ? Number(
                                addon.gstRate
                            ) || 0
                            : 0;


                    const addonTax =
                        calculateItemTax(
                            addonTaxable,
                            addonGST
                        );


                    items.push({

                        bill_id:
                            bill.id,

                        item_name:
                            addon.name,

                        item_type:
                            "addon",

                        quantity:
                            1,

                        price:
                            addonPrice,

                        total:
                            addonPrice,

                        hsn_sac:
                            addon.hsnSac ||
                            null,

                        gst_rate:
                            addonGST,

                        taxable_amount:
                            addonTaxable,

                        cgst_amount:
                            addonTax.cgstAmount,

                        sgst_amount:
                            addonTax.sgstAmount,

                        igst_amount:
                            addonTax.igstAmount,

                        tax_amount:
                            addonTax.taxAmount,

                        staff_id:
                            addon.staff_id || null

                    });

                }
            );


            // ======================================
            // PRODUCTS / RETAIL DEDUCTIONS
            // ======================================

            for (const prod of selectedProducts) {

                if (!prod.name) continue;

                const qty =
                    Number(prod.quantity) || 1;

                const prodPrice =
                    (Number(prod.price) || 0) * qty;

                const grossAmount =
                    totals.subtotal +
                    totals.addonTotal +
                    (totals.productTotal || 0);

                const prodDiscount =
                    grossAmount > 0
                        ? (prodPrice / grossAmount) * totals.discount
                        : 0;

                const prodTaxable =
                    Math.max(
                        0,
                        prodPrice - prodDiscount
                    );

                const prodGST =
                    profileSettings?.gst_enabled
                        ? Number(prod.gstRate) || 0
                        : 0;

                const prodTax =
                    calculateItemTax(
                        prodTaxable,
                        prodGST
                    );

                items.push({
                    bill_id: bill.id,
                    item_name: prod.name,
                    item_type: "product",
                    quantity: qty,
                    price: Number(prod.price) || 0,
                    total: prodPrice,
                    hsn_sac: prod.hsnSac || null,
                    gst_rate: prodGST,
                    taxable_amount: prodTaxable,
                    cgst_amount: prodTax.cgstAmount,
                    sgst_amount: prodTax.sgstAmount,
                    igst_amount: prodTax.igstAmount,
                    tax_amount: prodTax.taxAmount,
                    staff_id: prod.staff_id || null
                });

                // Deduct stock from inventory & log sale transaction
                if (prod.inventory_id) {
                    try {
                        const { data: invItem } = await client
                            .from("inventory")
                            .select("stock")
                            .eq("id", prod.inventory_id)
                            .single();

                        if (invItem) {
                            const newStock = Math.max(0, (Number(invItem.stock) || 0) - qty);
                            await client
                                .from("inventory")
                                .update({ stock: newStock })
                                .eq("id", prod.inventory_id);
                        }

                        await client.from("inventory_transactions").insert([{
                            profile_id: user.id,
                            inventory_id: prod.inventory_id,
                            quantity_change: -qty,
                            type: "sale",
                            bill_id: bill.id
                        }]);
                    } catch (invErr) {
                        console.error("Failed to update inventory stock for:", prod.name, invErr);
                    }
                }

            }


            // ======================================
            // SAVE BILL ITEMS
            // ======================================

            const {
                error: itemError
            } =
                await client

                    .from("bill_items")

                    .insert(items);


            if (itemError) {

                console.error(
                    itemError
                );

                alert(
                    "Bill created but items could not be saved."
                );

                return;

            }


            // ======================================
            // MARK BOOKING COMPLETED
            // ======================================

            await client

                .from("bookings")

                .update({

                    status:
                        "Completed"

                })

                .eq(
                    "id",
                    booking.id
                );


            // ======================================
            // GO TO INVOICE
            // ======================================

            window.location.href =
                `invoice.html?bill=${bill.id}`;

        }
    );


// ==========================================
// HTML ESCAPE
// ==========================================

function escapeHtml(value) {

    return String(value || "")
        .replace(
            /&/g,
            "&amp;"
        )
        .replace(
            /</g,
            "&lt;"
        )
        .replace(
            />/g,
            "&gt;"
        )
        .replace(
            /"/g,
            "&quot;"
        )
        .replace(
            /'/g,
            "&#039;"
        );

}


// ==========================================
// START
// ==========================================

loadBooking();