let booking = null;

let addons = [];

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
            addonTotal
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
        );


    const cgstAmount =
        mainTax.cgstAmount +
        addonCGST;


    const sgstAmount =
        mainTax.sgstAmount +
        addonSGST;


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
                    mainTax.taxAmount

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
                            addonTax.taxAmount

                    });

                }
            );


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