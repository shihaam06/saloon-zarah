const params =
    new URLSearchParams(
        window.location.search
    );

const billId =
    params.get("bill");


let bill = null;

let booking = null;

let items = [];


// ==========================================
// LOAD BILL
// ==========================================

async function loadBill() {

    if (!billId) {

        alert("No bill selected.");

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
    // LOAD BILL
    // ======================================

    const {
        data: billData,
        error: billError
    } =
        await client

            .from("bills")

            .select("*")

            .eq(
                "id",
                billId
            )

            .eq(
                "profile_id",
                user.id
            )

            .single();


    if (billError) {

        console.error(
            "Bill loading error:",
            billError
        );

        alert(
            "Unable to load bill."
        );

        return;

    }


    bill = billData;


    // ======================================
    // LOAD BILL ITEMS
    // ======================================

    const {
        data: itemData,
        error: itemError
    } =
        await client

            .from("bill_items")

            .select("*")

            .eq(
                "bill_id",
                bill.id
            )

            .order(
                "created_at",
                {
                    ascending: true
                }
            );


    if (itemError) {

        console.error(
            "Bill items loading error:",
            itemError
        );

        alert(
            "Unable to load bill items."
        );

        return;

    }


    items =
        itemData || [];


    // ======================================
    // LOAD BOOKING
    // ======================================

    if (bill.booking_id) {

        const {
            data: bookingData,
            error: bookingError
        } =
            await client

                .from("bookings")

                .select("*")

                .eq(
                    "id",
                    bill.booking_id
                )

                .single();


        if (bookingError) {

            console.error(
                "Booking loading error:",
                bookingError
            );

        }


        booking =
            bookingData || null;

    }


    renderInvoice();

}


// ==========================================
// RENDER INVOICE
// ==========================================

function renderInvoice() {

    document.getElementById(
        "loading"
    ).style.display =
        "none";


    document.getElementById(
        "invoice"
    ).style.display =
        "block";


    document.getElementById(
        "actions"
    ).style.display =
        "flex";


    // ======================================
    // BILL NUMBER
    // ======================================

    document.getElementById(
        "billNumber"
    ).textContent =
        bill.invoice_number ||
        bill.id
            .substring(0, 8)
            .toUpperCase();


    // ======================================
    // DATE
    // ======================================

    const invoiceDate =
        bill.invoice_date ||
        bill.created_at;


    document.getElementById(
        "billDate"
    ).textContent =
        new Date(
            invoiceDate
        ).toLocaleString(
            "en-IN",
            {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }
        );


    // ======================================
    // CUSTOMER
    // ======================================

    document.getElementById(
        "customerName"
    ).textContent =
        bill.customer_name ||
        "-";


    document.getElementById(
        "customerPhone"
    ).textContent =
        bill.phone ||
        "-";


    // ======================================
    // APPOINTMENT
    // ======================================

    let appointment =
        "-";


    if (
        booking &&
        booking.booking_date
    ) {

        appointment =
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
        booking &&
        booking.booking_time
    ) {

        appointment +=
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
        "appointment"
    ).textContent =
        appointment;


    // ======================================
    // ITEMS
    // ======================================

    const itemsContainer =
        document.getElementById(
            "items"
        );


    itemsContainer.innerHTML =
        "";


    if (!items.length) {

        itemsContainer.innerHTML = `

            <tr>

                <td colspan="2"
                    style="
                        text-align:center;
                        color:#8993a1;
                    "
                >
                    No bill items
                </td>

            </tr>

        `;

    }


    items.forEach(
        item => {

            itemsContainer.innerHTML += `

                <tr>

                    <td>

                        <strong>
                            ${escapeHtml(
                                item.item_name
                            )}
                        </strong>

                        <div class="item-type">

                            ${
                                item.item_type === "addon"
                                    ? "Add-on"
                                    : item.item_type === "product"
                                        ? "Product"
                                        : "Service"
                            }

                            ${
                                item.hsn_sac
                                    ? ` • HSN/SAC: ${escapeHtml(item.hsn_sac)}`
                                    : ""
                            }

                            ${
                                Number(item.gst_rate) > 0
                                    ? ` • GST ${Number(item.gst_rate)}%`
                                    : ""
                            }

                        </div>

                    </td>

                    <td>

                        ₹${Number(
                            item.total || 0
                        ).toLocaleString(
                            "en-IN",
                            {
                                minimumFractionDigits: 2
                            }
                        )}

                    </td>

                </tr>

            `;

        }
    );


    // ======================================
    // TOTALS
    // ======================================

    const subtotal =
        Number(
            bill.subtotal
        ) || 0;


    const addonTotal =
        Number(
            bill.addon_total
        ) || 0;


    const discount =
        Number(
            bill.discount
        ) || 0;


    const taxableAmount =
        Number(
            bill.taxable_amount
        ) || 0;


    const cgstAmount =
        Number(
            bill.cgst_amount
        ) || 0;


    const sgstAmount =
        Number(
            bill.sgst_amount
        ) || 0;


    const igstAmount =
        Number(
            bill.igst_amount
        ) || 0;


    const totalTax =
        Number(
            bill.total_tax
        ) || 0;


    const total =
        Number(
            bill.total
        ) || 0;


    document.getElementById(
        "subtotal"
    ).textContent =
        formatMoney(subtotal);


    document.getElementById(
        "addonTotal"
    ).textContent =
        formatMoney(addonTotal);


    document.getElementById(
        "discount"
    ).textContent =
        "-" +
        formatMoney(discount);


    document.getElementById(
        "taxableAmount"
    ).textContent =
        formatMoney(taxableAmount);


    document.getElementById(
        "cgstAmount"
    ).textContent =
        formatMoney(cgstAmount);


    document.getElementById(
        "sgstAmount"
    ).textContent =
        formatMoney(sgstAmount);


    document.getElementById(
        "igstAmount"
    ).textContent =
        formatMoney(igstAmount);


    document.getElementById(
        "totalTax"
    ).textContent =
        formatMoney(totalTax);


    document.getElementById(
        "total"
    ).textContent =
        formatMoney(total);


    // ======================================
    // GST INFORMATION
    // ======================================

    const gstSection =
        document.getElementById(
            "gstSection"
        );


    if (
        gstSection &&
        totalTax > 0
    ) {

        gstSection.style.display =
            "block";

    }
    else if (gstSection) {

        gstSection.style.display =
            "none";

    }


    const sellerGstin =
        document.getElementById(
            "sellerGstin"
        );


    if (sellerGstin) {

        sellerGstin.textContent =
            bill.seller_gstin ||
            "Not provided";

    }


    const sellerState =
        document.getElementById(
            "sellerState"
        );


    if (sellerState) {

        let stateText =
            bill.seller_state ||
            "";


        if (
            bill.seller_state_code
        ) {

            stateText +=
                stateText
                    ? ` (${bill.seller_state_code})`
                    : bill.seller_state_code;

        }


        sellerState.textContent =
            stateText ||
            "Not provided";

    }


    // ======================================
    // PAYMENT
    // ======================================

    document.getElementById(
        "paymentMethod"
    ).textContent =
        bill.payment_method ||
        "-";


    const paymentStatus =
        document.getElementById(
            "paymentStatus"
        );


    if (paymentStatus) {

        paymentStatus.textContent =
            (
                bill.payment_status ||
                "Paid"
            ).toUpperCase();

    }


    // ======================================
    // BUSINESS NAME
    // ======================================

    loadBusinessName();

}


// ==========================================
// BUSINESS NAME
// ==========================================

async function loadBusinessName() {

    const {
        data: {
            user
        }
    } =
        await client.auth.getUser();


    if (!user) return;


    const {
        data,
        error
    } =
        await client

            .from("profiles")

            .select(`
                business_name,
                business_address,
                business_phone
            `)

            .eq(
                "id",
                user.id
            )

            .single();


    if (error) {

        console.error(
            "Business profile error:",
            error
        );

        return;

    }


    if (
        data &&
        data.business_name
    ) {

        document.getElementById(
            "businessName"
        ).textContent =
            data.business_name;


        document.getElementById(
            "footerBusiness"
        ).textContent =
            data.business_name;

    }


    const address =
        document.getElementById(
            "businessAddress"
        );


    if (
        address &&
        data.business_address
    ) {

        address.textContent =
            data.business_address;

    }


    const phone =
        document.getElementById(
            "businessPhone"
        );


    if (
        phone &&
        data.business_phone
    ) {

        phone.textContent =
            data.business_phone;

    }

}


// ==========================================
// WHATSAPP
// ==========================================

document
    .getElementById(
        "whatsappBtn"
    )
    .addEventListener(
        "click",
        async () => {

            if (!bill) return;


            const button =
                document.getElementById(
                    "whatsappBtn"
                );


            button.disabled =
                true;


            button.textContent =
                "Sending...";


            try {

                const response =
                    await fetch(
                        "https://saloon-zarah.onrender.com/send-bill",
                        {

                            method: "POST",

                            headers: {

                                "Content-Type":
                                    "application/json"

                            },

                            body:
                                JSON.stringify({

                                    billId:
                                        bill.id

                                })

                        }
                    );


                const result =
                    await response.json();


                if (!response.ok) {

                    throw new Error(
                        result.error ||
                        "Failed to send bill."
                    );

                }


                button.textContent =
                    "✓ Sent on WhatsApp";


                alert(
                    "Bill sent successfully to " +
                    bill.phone
                );

            }

            catch (error) {

                console.error(
                    error
                );


                button.disabled =
                    false;


                button.textContent =
                    "💬 Send on WhatsApp";


                alert(
                    "Could not send the bill. " +
                    error.message
                );

            }

        }
    );


// ==========================================
// HELPERS
// ==========================================

function formatMoney(value) {

    return "₹" +
        Number(
            value || 0
        ).toLocaleString(
            "en-IN",
            {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            }
        );

}


function escapeHtml(value) {

    return String(
        value || ""
    )
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

loadBill();