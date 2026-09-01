const path = require("path");
const fs = require("fs");
require("dotenv").config({ path: path.join(__dirname, ".env") });

// =====================================================
// IMPORTS
// =====================================================
const express = require("express");
const OpenAI = require("openai");
const twilio = require("twilio");
const cors = require("cors");
const { createClient } = require("@supabase/supabase-js");
const PDFDocument = require("pdfkit");
const Razorpay = require("razorpay");
const crypto = require("crypto");

const app = express();


// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors({
   origin: [
    "http://127.0.0.1:5500",
    "http://localhost:5500",
    "https://saloon-zarah.vercel.app",
    "https://kangro.in",
    "https://www.kangro.in"
],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));

app.use("/images", express.static(path.join(__dirname, "../frontend/images")));
// =====================================================
// RAZORPAY WEBHOOK
// IMPORTANT: MUST COME BEFORE express.json()
// =====================================================

app.post(
    "/razorpay/webhook",
    express.raw({
        type: "application/json"
    }),
    async (req, res) => {

        try {

            const signature =
                req.headers["x-razorpay-signature"];

            if (!signature) {

                console.error(
                    "Ã¢ÂÅ’ Razorpay webhook signature missing"
                );

                return res
                    .status(400)
                    .send("Signature missing");

            }


            // ==========================================
            // VERIFY RAZORPAY SIGNATURE
            // ==========================================

            const expectedSignature =
                crypto
                    .createHmac(
                        "sha256",
                        process.env.RAZORPAY_WEBHOOK_SECRET
                    )
                    .update(req.body)
                    .digest("hex");


            if (
                signature !==
                expectedSignature
            ) {

                console.error(
                    "Ã¢ÂÅ’ Invalid Razorpay webhook signature"
                );

                return res
                    .status(400)
                    .send("Invalid signature");

            }


            // ==========================================
            // PARSE WEBHOOK
            // ==========================================

            const event =
                JSON.parse(
                    req.body.toString()
                );


            console.log(
                "\n================================="
            );

            console.log(
                "RAZORPAY WEBHOOK"
            );

            console.log(
                "Event:",
                event.event
            );

            console.log(
                "================================="
            );


            // ==========================================
            // ONLY HANDLE PAYMENT LINK PAID
            // ==========================================

            if (
                event.event !==
                "payment_link.paid"
            ) {

                console.log(
                    "Ignoring Razorpay event:",
                    event.event
                );

                return res
                    .status(200)
                    .send("Event ignored");

            }


            // ==========================================
            // GET PAYMENT LINK DATA
            // ==========================================

            const paymentLink =
                event.payload
                    ?.payment_link
                    ?.entity;


            if (!paymentLink) {

                console.error(
                    "Ã¢ÂÅ’ Payment link data missing"
                );

                return res
                    .status(400)
                    .send("Payment link data missing");

            }


            const bookingId =
                paymentLink.reference_id;


            const amountPaid =
                Number(
                    paymentLink.amount_paid
                ) / 100;


            console.log(
                "Booking ID:",
                bookingId
            );

            console.log(
                "Amount paid:",
                amountPaid
            );


            // ==========================================
            // SAFETY CHECK
            // ==========================================

            if (!bookingId) {

                console.error(
                    "Ã¢ÂÅ’ No booking reference found"
                );

                return res
                    .status(400)
                    .send("Booking reference missing");

            }


            // ==========================================
            // ONLY ACCEPT Ã¢â€šÂ¹500 ADVANCE
            // ==========================================

            if (
                amountPaid <
                ADVANCE_AMOUNT
            ) {

                console.error(
                    "Ã¢ÂÅ’ Incorrect payment amount:",
                    amountPaid
                );

                return res
                    .status(400)
                    .send("Incorrect payment amount");

            }


            // ==========================================
            // FIND BOOKING
            // ==========================================

            const {
                data: booking,
                error: bookingError
            } =
                await supabase

                    .from("bookings")

                    .select("*")

                    .eq(
                        "id",
                        bookingId
                    )

                    .single();


            if (
                bookingError ||
                !booking
            ) {

                console.error(
                    "Ã¢ÂÅ’ Booking not found:",
                    bookingError
                );

                return res
                    .status(404)
                    .send("Booking not found");

            }


            // ==========================================
            // IDEMPOTENCY
            // Don't process the same payment twice
            // ==========================================

            if (
                booking.advance_payment_status ===
                "Paid"
            ) {

                console.log(
                    "Ã¢Å¡Â Ã¯Â¸Â Advance already marked as paid."
                );

                return res
                    .status(200)
                    .send("Already processed");

            }


            // ==========================================
            // UPDATE BOOKING
            // ==========================================

            const {
                data: updatedBooking,
                error: updateError
            } =
                await supabase

                    .from("bookings")

                    .update({

                        status:
                            "Confirmed",

                        advance_paid:
                            ADVANCE_AMOUNT,

                        advance_payment_method:
                            "Razorpay",

                        advance_payment_status:
                            "Paid",

                        balance_amount:
    Math.max(
        (await getServicePrice(
            booking.service
        )) -
        ADVANCE_AMOUNT,
        0
    )

                    })

                    .eq(
                        "id",
                        bookingId
                    )

                    .select()
                    .single();


            if (updateError) {

                console.error(
                    "Ã¢ÂÅ’ Booking update failed:",
                    updateError
                );

                return res
                    .status(500)
                    .send("Booking update failed");

            }


            console.log(
                "================================="
            );

            console.log(
                "Ã¢Å“â€¦ ADVANCE PAYMENT CONFIRMED"
            );

            console.log(
                "Booking:",
                updatedBooking.id
            );

            console.log(
                "Advance:",
                `Ã¢â€šÂ¹${ADVANCE_AMOUNT}`
            );

            console.log(
                "Balance:",
                `Ã¢â€šÂ¹${updatedBooking.balance_amount}`
            );

            console.log(
                "================================="
            );


            // ==========================================
            // SEND WHATSAPP CONFIRMATION
            // ==========================================

//             const whatsappTo =
//                 updatedBooking.phone
//                     .startsWith("whatsapp:")
//                     ? updatedBooking.phone
//                     : `whatsapp:${updatedBooking.phone}`;


//             const confirmationMessage = `

// Perfect! Your appointment is confirmed. Ã°Å¸ËœÅ 

// Ã¢Å“Â¨ ${BUSINESS.name}

// Service: ${updatedBooking.service}

// Date: ${formatDateForCustomer(
//     updatedBooking.booking_date
// )}

// Time: ${formatTimeForCustomer(
//     updatedBooking.booking_time
// )}

// Ã°Å¸â€™Â³ Advance paid: Ã¢â€šÂ¹${ADVANCE_AMOUNT}

// Ã°Å¸â€™Â° Balance remaining: Ã¢â€šÂ¹${updatedBooking.balance_amount}

// Ã°Å¸â€œÂ ${BUSINESS.address}

// We look forward to seeing you! Ã°Å¸ËœÅ 
// `;


//             try {

//                 const message =
//                     await twilioClient
//                         .messages
//                         .create({

//                             from:
//                                 process.env
//                                     .TWILIO_WHATSAPP_NUMBER,

//                             to:
//                                 whatsappTo,

//                             body:
//                                 confirmationMessage

//                         });


//                 console.log(
//                     "Ã¢Å“â€¦ WhatsApp confirmation sent:",
//                     message.sid
//                 );

//             }

//             catch (whatsappError) {

//                 console.error(
//                     "Ã¢Å¡Â Ã¯Â¸Â Payment confirmed but WhatsApp failed:",
//                     whatsappError
//                 );

//             }

// ==========================================
// SEND PAYMENT CONFIRMATION
// ==========================================

const confirmationMessage = `
Perfect! Your appointment is confirmed. Ã°Å¸ËœÅ 

Ã¢Å“Â¨ ${BUSINESS.name}

Service: ${updatedBooking.service}
Date: ${formatDateForCustomer(
    updatedBooking.booking_date
)}
Time: ${formatTimeForCustomer(
    updatedBooking.booking_time
)}

Ã°Å¸â€™Â³ Advance paid: Ã¢â€šÂ¹${ADVANCE_AMOUNT}
Ã°Å¸â€™Â° Balance remaining: Ã¢â€šÂ¹${updatedBooking.balance_amount}

Ã°Å¸â€œÂ ${BUSINESS.address}

We look forward to seeing you! Ã°Å¸ËœÅ 
`;

try {

    // ==========================================
    // INSTAGRAM BOOKING
    // ==========================================

    if (
    updatedBooking.source === "Instagram" &&
    updatedBooking.instagram_user_id
) {

    console.log(
        "Ã°Å¸â€œÂ¸ Sending Instagram payment confirmation to:",
        updatedBooking.instagram_user_id
    );

    await sendInstagramMessage(
    updatedBooking.instagram_user_id,
    confirmationMessage,
    updatedBooking.profile_id
);

    console.log(
        "Ã¢Å“â€¦ Instagram confirmation sent"
    );
}

    // ==========================================
    // WHATSAPP BOOKING
    // ==========================================

    else {

        const whatsappTo =
            updatedBooking.phone
                .startsWith("whatsapp:")
                ? updatedBooking.phone
                : `whatsapp:${updatedBooking.phone}`;

        const message =
            await twilioClient
                .messages
                .create({

                    from:
                        process.env
                            .TWILIO_WHATSAPP_NUMBER,

                    to:
                        whatsappTo,

                    body:
                        confirmationMessage
                });

        console.log(
            "Ã¢Å“â€¦ WhatsApp confirmation sent:",
            message.sid
        );
    }

}

catch (notificationError) {

    console.error(
        "Ã¢Å¡Â Ã¯Â¸Â Payment confirmed but confirmation message failed:",
        notificationError
    );

}


            return res
                .status(200)
                .send("Payment processed");

        }

        catch (error) {

            console.error(
                "\nÃ¢ÂÅ’ RAZORPAY WEBHOOK ERROR:"
            );

            console.error(
                error
            );

            return res
                .status(500)
                .send("Webhook error");

        }

    }
);

app.use(express.urlencoded({ extended: true, limit: "25mb" }));
app.use(express.json({ limit: "25mb" }));


// =====================================================
// CLIENTS
// =====================================================

const client = new OpenAI({
    apiKey: process.env.OPENROUTER_API_KEY,
    baseURL: "https://openrouter.ai/api/v1"
});

const twilioClient = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const INSTAGRAM_ACCESS_TOKEN =
    process.env.INSTAGRAM_ACCESS_TOKEN;


// =====================================================
// CONFIG
// =====================================================

const PROFILE_ID =
    process.env.PROFILE_ID ||
    "e61565b7-afa5-4f5d-8806-8dc833521cac";

const PORT =
    process.env.PORT || 3000;

const PUBLIC_BASE_URL =
    (
        process.env.PUBLIC_BASE_URL ||
        `http://localhost:${PORT}`
    ).replace(/\/$/, "");

const ADVANCE_AMOUNT = 500;

const UPI_ID =
    process.env.UPI_ID ||
    "mohammedshihaamfayaz@okaxis";

const AI_MODEL =
    process.env.OPENROUTER_MODEL ||
    "openrouter/auto";

// =====================================================
// QR CODE UPLOAD ENDPOINT (FOR GPAY / UPI QR CODES)
// =====================================================

app.post("/api/upload-qr", async (req, res) => {
    try {
        const { profile_id, image_data } = req.body;
        if (!image_data) {
            return res.status(400).json({ error: "Missing image data" });
        }

        const safeId = (profile_id || "default").replace(/[^a-zA-Z0-9_-]/g, "");
        const base64Data = image_data.replace(/^data:image\/\w+;base64,/, "");
        const buffer = Buffer.from(base64Data, "base64");

        // 1. Save to frontend/images for local serving
        const imagesDir = path.join(__dirname, "../frontend/images");
        if (!fs.existsSync(imagesDir)) {
            fs.mkdirSync(imagesDir, { recursive: true });
        }
        const fileName = `qr-${safeId}-${Date.now()}.png`;
        const filePath = path.join(imagesDir, fileName);
        fs.writeFileSync(filePath, buffer);

        let finalUrl = `/images/${fileName}`;

        // 2. Also try uploading to Supabase Storage if available
        try {
            const { data: uploadData, error: uploadErr } = await supabase.storage
                .from("bills")
                .upload(`qr/${fileName}`, buffer, {
                    contentType: "image/png",
                    upsert: true
                });

            if (!uploadErr && uploadData) {
                const { data: publicUrlData } = supabase.storage
                    .from("bills")
                    .getPublicUrl(`qr/${fileName}`);
                if (publicUrlData?.publicUrl) {
                    finalUrl = publicUrlData.publicUrl;
                }
            }
        } catch (storageErr) {
            console.warn("Storage upload fallback to local URL:", storageErr.message);
        }

        // 3. Update profile if profile_id provided
        if (profile_id) {
            await supabase
                .from("profiles")
                .update({
                    upi_qr_image: finalUrl,
                    gpay_qr_url: finalUrl
                })
                .eq("id", profile_id);
        }

        return res.status(200).json({
            success: true,
            qr_url: finalUrl,
            message: "QR code uploaded and saved successfully"
        });
    } catch (err) {
        console.error("QR upload error:", err);
        return res.status(500).json({ error: "Failed to upload QR code" });
    }
});

// =====================================================
// TEST AI ENDPOINT (FOR DASHBOARD INTERACTIVE TESTING)
// =====================================================

app.post("/api/test-ai", async (req, res) => {
    try {
        const { profile_id, message, preview_profile } = req.body;
        if (!message || !message.trim()) {
            return res.status(400).json({ error: "Message is required" });
        }

        // 1. Load base profile from DB (or default)
        let biz = await getBusinessProfile(profile_id);

        // 2. If preview_profile provided from frontend form, override fields
        if (preview_profile && typeof preview_profile === "object") {
            if (preview_profile.business_name) biz.name = preview_profile.business_name.trim();
            if (preview_profile.business_category) biz.category = preview_profile.business_category.trim();
            if (preview_profile.ai_tone) biz.tone = preview_profile.ai_tone.trim();
            if (preview_profile.business_description !== undefined) biz.description = preview_profile.business_description.trim();
            if (preview_profile.business_hours !== undefined) biz.hours = preview_profile.business_hours.trim();
            if (preview_profile.business_address !== undefined) biz.address = preview_profile.business_address.trim();
            if (preview_profile.business_phone !== undefined) biz.phone = preview_profile.business_phone.trim();
            if (preview_profile.pricing_info !== undefined) biz.pricingInfo = preview_profile.pricing_info.trim();
            if (preview_profile.booking_rules !== undefined) biz.bookingRules = preview_profile.booking_rules.trim();
            if (preview_profile.delivery_info !== undefined) biz.deliveryInfo = preview_profile.delivery_info.trim();
            if (preview_profile.payment_info !== undefined) biz.paymentInfo = preview_profile.payment_info.trim();
            if (preview_profile.ai_instructions !== undefined) biz.aiInstructions = preview_profile.ai_instructions.trim();
            if (preview_profile.faq_data !== undefined) biz.faqData = preview_profile.faq_data.trim();
            if (preview_profile.upi_id !== undefined) biz.upiId = preview_profile.upi_id.trim();
            if (preview_profile.advance_amount !== undefined) biz.advance = Number(preview_profile.advance_amount) || 0;
            biz.isSalon = biz.category.toLowerCase() === "salon";
        }

        const systemPrompt = buildAISystemPrompt(biz);

        const completion = await client.chat.completions.create({
            model: AI_MODEL,
            temperature: 0.7,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: message.trim() }
            ]
        });

        const reply = completion.choices[0]?.message?.content?.trim() || "No response generated.";

        return res.status(200).json({
            success: true,
            reply,
            profile_used: {
                name: biz.name,
                category: biz.category,
                tone: biz.tone
            }
        });
    } catch (err) {
        console.error("Test AI error:", err);
        return res.status(500).json({ error: err.message || "Failed to test AI response" });
    }
});

// =====================================================
// AI SETTINGS SAVE / UPDATE ENDPOINT
// =====================================================

app.post("/api/profile/ai-settings", async (req, res) => {
    try {
        const { profile_id, settings } = req.body;
        if (!profile_id || !settings) {
            return res.status(400).json({ error: "profile_id and settings are required" });
        }

        const updateData = {
            business_name: settings.business_name,
            business_address: settings.business_address,
            business_phone: settings.business_phone,
            business_hours: settings.business_hours,
            business_description: settings.business_description,
            business_category: settings.business_category,
            ai_tone: settings.ai_tone || "Friendly",
            pricing_info: settings.pricing_info,
            booking_rules: settings.booking_rules,
            delivery_info: settings.delivery_info,
            payment_info: settings.payment_info,
            faq_data: settings.faq_data,
            ai_instructions: settings.ai_instructions,
            upi_id: settings.upi_id,
            advance_amount: settings.advance_amount ? Number(settings.advance_amount) : 0,
            ai_business_profile: settings
        };

        // Filter out undefined keys
        Object.keys(updateData).forEach(k => {
            if (updateData[k] === undefined) delete updateData[k];
        });

        // 1. Try full update (with dedicated columns)
        let { data, error } = await supabase
            .from("profiles")
            .update(updateData)
            .eq("id", profile_id);

        // 2. If dedicated columns not yet migrated in DB, gracefully fallback
        if (error && (error.message.includes("column") || error.code === "42703")) {
            console.warn("Falling back to core profile update:", error.message);
            const coreUpdate = {
                business_name: settings.business_name,
                business_address: settings.business_address,
                business_phone: settings.business_phone,
                business_hours: settings.business_hours,
                business_description: settings.business_description,
                ai_instructions: JSON.stringify(settings),
                upi_id: settings.upi_id,
                advance_amount: settings.advance_amount ? Number(settings.advance_amount) : 0
            };
            Object.keys(coreUpdate).forEach(k => {
                if (coreUpdate[k] === undefined) delete coreUpdate[k];
            });
            const fallbackRes = await supabase
                .from("profiles")
                .update(coreUpdate)
                .eq("id", profile_id);
            error = fallbackRes.error;
        }

        if (error) {
            console.error("Save AI settings error:", error);
            return res.status(500).json({ error: error.message });
        }

        return res.status(200).json({
            success: true,
            message: "AI Business Profile saved successfully"
        });
    } catch (err) {
        console.error("AI settings endpoint error:", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
});

// =====================================================
// POUCH ORDER BILLING & PAYMENT QR ENDPOINTS
// =====================================================

app.post("/api/pouch/send-payment-qr", async (req, res) => {
    try {
        const { order_id, profile_id, customer_name, bill_summary, amount, instagram_user_id, custom_requirements } = req.body;
        if (!order_id || !profile_id) {
            return res.status(400).json({ error: "Missing order_id or profile_id" });
        }

        // Fetch seller's business profile
        const biz = await getBusinessProfile(profile_id);
        const upiId = biz.upi_id || "Not configured";
        const qrUrl = biz.gpay_qr_url || biz.upi_qr_image || null;

        // Build bill message
        const shortId = `#P-${String(order_id).substring(0, 6).toUpperCase()}`;
        const billMsg = bill_summary || 
`🧾 *Order Bill from ${biz.name}*

Hi ${customer_name || "there"}! Here are your order & payment details:

📋 *Order ID:* ${shortId}
🛍️ *Details:* ${custom_requirements || "Custom Order"}
💰 *Total Amount:* ₹${Number(amount || 0).toLocaleString("en-IN")}

💳 *Pay via UPI:* \`${upiId}\`

Scan the UPI QR code below or use our UPI ID to pay.
📸 *Please send a screenshot of your payment here once completed so we can confirm your order!*

Thank you! 🙏
— ${biz.name}`;

        let igMessageSent = false;
        let igImageSent = false;

        // If instagram_user_id exists, send through Instagram Messages API
        if (instagram_user_id && biz.instagram_connected) {
            try {
                await sendInstagramMessage(instagram_user_id, billMsg, profile_id);
                igMessageSent = true;
                if (qrUrl) {
                    await sendInstagramImage(instagram_user_id, qrUrl, profile_id);
                    igImageSent = true;
                }
                addConversation(`instagram:${instagram_user_id}`, "assistant", billMsg);
            } catch (igErr) {
                console.warn("Instagram send in send-payment-qr:", igErr.message);
            }
        }

        // Update booking in Supabase
        const updatePayload = {
            payment_status: "QR Sent",
            bill_amount: Number(amount) || 0,
            bill_details: billMsg
        };
        if (custom_requirements) {
            updatePayload.custom_requirements = custom_requirements;
        }

        const { data: updatedBooking, error: updateErr } = await supabase
            .from("bookings")
            .update(updatePayload)
            .eq("id", order_id)
            .select()
            .maybeSingle();

        if (updateErr) {
            console.error("Error updating order payment status in DB:", updateErr);
        }

        return res.status(200).json({
            success: true,
            message: "Payment QR & Bill generated successfully",
            payment_status: "QR Sent",
            qr_url: qrUrl,
            upi_id: upiId,
            bill_text: billMsg,
            ig_sent: igMessageSent,
            order: updatedBooking
        });
    } catch (err) {
        console.error("send-payment-qr error:", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
});

app.post("/api/pouch/update-payment-status", async (req, res) => {
    try {
        const { order_id, profile_id, payment_status, stage, notes } = req.body;
        if (!order_id) {
            return res.status(400).json({ error: "Missing order_id" });
        }

        const validStatuses = [
            "Payment Not Requested",
            "QR Sent",
            "Payment Screenshot Received",
            "Payment Confirmed",
            "Payment Rejected"
        ];

        if (!validStatuses.includes(payment_status)) {
            return res.status(400).json({ error: `Invalid payment status: ${payment_status}` });
        }

        const updateData = {
            payment_status: payment_status
        };

        if (payment_status === "Payment Confirmed") {
            let dbStatus = "confirmed";
            if (stage === "prod") dbStatus = "in_progress";
            else if (stage === "done") dbStatus = "completed";
            updateData.status = dbStatus;
        } else if (payment_status === "Payment Rejected") {
            if (notes) updateData.notes = notes;
        }

        if (stage && payment_status !== "Payment Confirmed") {
            let dbStatus = "pending";
            if (stage === "paid") dbStatus = "confirmed";
            else if (stage === "prod") dbStatus = "in_progress";
            else if (stage === "done") dbStatus = "completed";
            else if (stage === "inquiry") dbStatus = "pending";
            updateData.status = dbStatus;
        }

        const { data: updatedOrder, error: updateErr } = await supabase
            .from("bookings")
            .update(updateData)
            .eq("id", order_id)
            .select()
            .maybeSingle();

        if (updateErr) {
            console.error("Update payment status error:", updateErr);
            return res.status(500).json({ error: updateErr.message });
        }

        // If connected to Instagram and seller confirmed payment, notify customer
        if (payment_status === "Payment Confirmed" && updatedOrder?.instagram_user_id) {
            try {
                const biz = await getBusinessProfile(profile_id || updatedOrder.profile_id);
                const confMsg = `🎉 *Payment Confirmed!* Your payment has been verified and your order is now confirmed & in production! 📦✨\n\n— ${biz.name}`;
                await sendInstagramMessage(updatedOrder.instagram_user_id, confMsg, profile_id || updatedOrder.profile_id);
                addConversation(`instagram:${updatedOrder.instagram_user_id}`, "assistant", confMsg);
            } catch(e) {
                console.warn("Instagram confirmation message notice:", e.message);
            }
        }

        return res.status(200).json({
            success: true,
            order: updatedOrder,
            payment_status: payment_status
        });
    } catch (err) {
        console.error("update-payment-status error:", err);
        return res.status(500).json({ error: err.message || "Internal server error" });
    }
});



// =====================================================
// BUSINESS INFORMATION
// =====================================================

const BUSINESS = {

    name:
        "ZARAH ELITE",

    address:
        "Nova Arcade, Kadri Tol Gate, Nantoor Post, Mangalore - 575002",

    phone:
        "9019725884",

    hours:
        "Every day, 9:00 AM to 10:00 PM"

};

// =====================================================
// CONVERSATION MEMORY
// =====================================================

const conversations = new Map();


function getConversation(phone) {

    if (!conversations.has(phone)) {

        conversations.set(phone, []);

    }

    return conversations.get(phone);

}


function addConversation(phone, role, message) {

    const history =
        getConversation(phone);

    history.push({
        role,
        content: message
    });

    // Keep last 20 messages
    if (history.length > 20) {

        history.splice(
            0,
            history.length - 20
        );

    }

}


// =====================================================
// DATE / TIME HELPERS
// =====================================================

function getIndiaDate() {

    return new Intl.DateTimeFormat(
        "en-CA",
        {
            timeZone: "Asia/Kolkata",
            year: "numeric",
            month: "2-digit",
            day: "2-digit"
        }
    ).format(new Date());

}


function formatDateForCustomer(dateString) {

    if (!dateString) {
        return "";
    }

    const date =
        new Date(`${dateString}T00:00:00`);

    if (isNaN(date.getTime())) {
        return dateString;
    }

    return date.toLocaleDateString(
        "en-IN",
        {
            weekday: "long",
            day: "numeric",
            month: "long",
            year: "numeric"
        }
    );

}


function formatTimeForCustomer(timeString) {

    if (!timeString) {
        return "";
    }

    const parts =
        timeString.split(":");

    if (parts.length < 2) {
        return timeString;
    }

    let hour =
        Number(parts[0]);

    const minute =
        parts[1];

    if (isNaN(hour)) {
        return timeString;
    }

    const suffix =
        hour >= 12
            ? "PM"
            : "AM";

    hour =
        hour % 12 || 12;

    return `${hour}:${minute} ${suffix}`;

}


// =====================================================
// SERVICE HELPERS
// =====================================================

// =====================================================
// SERVICE DATABASE HELPERS
// =====================================================

function cleanServiceName(value) {
    return String(value || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}


// Find one active service from Supabase
async function findServiceInDatabase(serviceName, profileId) {

    if (!serviceName) {
        return null;
    }

    const resolvedProfileId = profileId || PROFILE_ID;

    const {
        data,
        error
    } = await supabase
        .from("services")
        .select(`
            id,
            name,
            item_type,
            price,
            hsn_sac,
            gst_rate,
            active
        `)
        .eq(
            "profile_id",
            resolvedProfileId
        )
        .eq(
            "active",
            true
        );

    if (error) {

        console.error(
            "SERVICE DATABASE ERROR:",
            error
        );

        return null;
    }

    const wanted =
        cleanServiceName(serviceName);

    return (
        data || []
    ).find(
        service =>
            cleanServiceName(
                service.name
            ) === wanted
    ) || null;
}


// Get ALL active services
async function getServicesFromDatabase(profileId) {
    const resolvedProfileId = profileId || PROFILE_ID;
    const {
        data,
        error
    } = await supabase
        .from("services")
        .select(`
            id,
            name,
            item_type,
            category,
            available_for,
            duration,
            price,
            hsn_sac,
            gst_rate
        `)
        .eq(
            "profile_id",
            resolvedProfileId
        )
        .eq(
            "active",
            true
        )
        .order(
            "name",
            {
                ascending: true
            }
        );

    if (error) {

        console.error(
            "SERVICES LOAD ERROR:",
            error
        );

        return [];
    }

    return data || [];
}


// Get one service price from DB
async function getServicePrice(serviceName, profileId) {

    const service =
        await findServiceInDatabase(
            serviceName,
            profileId
        );

    if (!service) {
        return 0;
    }

    return Number(
        service.price
    ) || 0;
}


// =====================================================
// DYNAMIC BUSINESS PROFILE LOADER
// =====================================================

/**
 * Load full AI Business Profile from Supabase profiles table.
 * Supports all business categories: Salon, Bakery, Clothing, Crochet / Handmade,
 * Home Business, Retail, Service Business, Other.
 * Pulls live database products (inventory table) and services (services table).
 */
async function getBusinessProfile(profileId) {
    const id = profileId || PROFILE_ID;
    const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", id)
        .maybeSingle();

    if (error) {
        console.warn("getBusinessProfile error:", error.message);
    }

    const p = data || {};

    // Parse backup JSON if present or extract individual fields
    let extra = {};
    if (p.ai_business_profile) {
        try {
            extra = typeof p.ai_business_profile === "string" ? JSON.parse(p.ai_business_profile) : p.ai_business_profile;
        } catch (e) {
            console.warn("Error parsing ai_business_profile JSON:", e.message);
        }
    }

    // Category and product type resolution
    const productType = (p.product || extra.product || "sal").toLowerCase();
    const category = p.business_category || extra.business_category || (productType === "pouch" ? "Home Business / Retail" : "Salon");
    const isSalon = category.toLowerCase() === "salon" || (productType === "sal" && !p.business_category && !extra.business_category);

    const tone = p.ai_tone || extra.ai_tone || "Friendly";
    const name = p.business_name || extra.business_name || BUSINESS.name;
    const address = p.business_address || extra.business_address || BUSINESS.address;
    const phone = p.business_phone || extra.business_phone || BUSINESS.phone;
    const hours = p.business_hours || extra.business_hours || BUSINESS.hours;
    const description = p.business_description || extra.business_description || "";
    const pricingInfo = p.pricing_info || extra.pricing_info || "";
    const bookingRules = p.booking_rules || extra.booking_rules || "";
    const deliveryInfo = p.delivery_info || extra.delivery_info || "";
    const paymentInfo = p.payment_info || extra.payment_info || (p.upi_id ? `UPI ID: ${p.upi_id}` : "");
    const aiInstructions = p.ai_instructions || extra.ai_instructions || "";
    const faqData = p.faq_data || extra.faq_data || "";
    const upiId = p.upi_id || extra.upi_id || "";
    const qrUrl = p.gpay_qr_url || p.upi_qr_image || extra.gpay_qr_url || extra.upi_qr_image || "";
    const advance = Number(p.advance_amount || extra.advance_amount) || 0;

    // Load active inventory & services
    const [products, services] = await Promise.all([
        getInventoryFromDatabase(id),
        getServicesFromDatabase(id)
    ]);

    let catalogSummary = "";
    if (products && products.length > 0) {
        catalogSummary += "PRODUCTS IN INVENTORY:\n" + products.map(prod => `- ${prod.name} (₹${prod.price}) [Stock: ${Number(prod.stock) > 0 ? `${prod.stock} units available` : 'Made to order / Out of stock'}]${prod.category ? ` (Category: ${prod.category})` : ''}`).join("\n");
    }
    if (services && services.length > 0) {
        if (catalogSummary) catalogSummary += "\n\n";
        catalogSummary += "SERVICES MENU:\n" + services.map(s => `- ${s.name} (₹${s.price})${s.duration ? ` [Duration: ${s.duration} mins]` : ''}${s.category ? ` (Category: ${s.category})` : ''}`).join("\n");
    }

    return {
        id,
        name,
        category,
        tone,
        product: productType,
        isSalon,
        address,
        phone,
        hours,
        description,
        pricingInfo,
        bookingRules,
        deliveryInfo,
        paymentInfo,
        aiInstructions,
        faqData,
        upiId,
        qrUrl,
        advance,
        products,
        services,
        catalogSummary
    };
}

/**
 * Build the AI system persona string dynamically from the profile.
 * Single universal dynamic AI engine for all categories and products.
 */
function buildAISystemPrompt(biz) {
    const toneGuides = {
        "Professional": "Polite, structured, polished, efficient, and courteous.",
        "Friendly": "Warm, welcoming, conversational, helpful, with friendly emojis 😊✨.",
        "Casual": "Relaxed, modern, concise, approachable, like chatting with a friend on Instagram.",
        "Premium": "Sophisticated, elegant, attentive, refined, high-touch luxury service."
    };
    const toneGuide = toneGuides[biz.tone] || "Warm, attentive, and helpful.";

    const categoryDescriptions = {
        "Salon": "a professional salon and beauty studio. You assist clients with appointment bookings, service menus, prices, and salon timings.",
        "Bakery": "an artisanal home bakery and confectionery. You assist customers with cake orders, flavor options, prices, advance notice, and pickup/delivery.",
        "Crochet / Handmade": "a handmade crochet & crafts studio. You assist customers with custom handmade creations, yarn colors, pricing, turnaround times, and orders.",
        "Clothing": "a fashion & apparel brand. You help customers with sizing, product availability, prices, style recommendations, and shipping.",
        "Home Business": "a dedicated home-grown small business. You help customers with inquiries, product details, custom requests, and placing orders.",
        "Retail": "a boutique retail store. You help customers with product availability, prices, features, and ordering.",
        "Service Business": "a professional client service provider. You help clients with service inquiries, quotes, scheduling, and consultation.",
        "Other": "a customer-first business. You help customers with inquiries, product/service details, pricing, and placing orders."
    };
    const categoryDesc = categoryDescriptions[biz.category] || `a business in the "${biz.category}" category. You help customers with product/service details, pricing, and inquiries.`;

    const sections = [];

    sections.push(`==================================================
BUSINESS PROFILE & IDENTITY
==================================================
- Business Name: ${biz.name}
- Category: ${biz.category}
${biz.description ? `- About / Specialty: ${biz.description}` : ""}
${biz.address ? `- Location / Studio / Service Area: ${biz.address}` : ""}
${biz.hours ? `- Operating / Store Hours: ${biz.hours}` : ""}
${biz.phone ? `- Contact / WhatsApp: ${biz.phone}` : ""}`);

    if (biz.pricingInfo) {
        sections.push(`==================================================
PRICING & CUSTOMIZATION GUIDELINES
==================================================
${biz.pricingInfo}`);
    }

    if (biz.bookingRules) {
        sections.push(`==================================================
BOOKING & ORDERING RULES
==================================================
${biz.bookingRules}`);
    }

    if (biz.deliveryInfo) {
        sections.push(`==================================================
DELIVERY & SHIPPING INFORMATION
==================================================
${biz.deliveryInfo}`);
    }

    if (biz.paymentInfo || biz.upiId || biz.advance > 0) {
        let payBlock = biz.paymentInfo ? `${biz.paymentInfo}\n` : "";
        if (biz.upiId) payBlock += `UPI ID: ${biz.upiId}\n`;
        if (biz.advance > 0) payBlock += `Default Advance / Deposit Amount: ₹${biz.advance}\n`;
        sections.push(`==================================================
PAYMENT INFORMATION
==================================================
${payBlock.trim()}`);
    }

    if (biz.faqData) {
        sections.push(`==================================================
FREQUENTLY ASKED QUESTIONS (FAQ)
==================================================
${biz.faqData}`);
    }

    if (biz.aiInstructions) {
        sections.push(`==================================================
OWNER'S CUSTOM INSTRUCTIONS (HIGHEST PRIORITY)
==================================================
${biz.aiInstructions}`);
    }

    if (biz.catalogSummary) {
        sections.push(`==================================================
LIVE CATALOG & DATABASE ITEMS
==================================================
${biz.catalogSummary}`);
    }

    return `You are the official AI assistant representing "${biz.name}", ${categoryDesc}
Your communication tone is: ${biz.tone} (${toneGuide}).

${sections.join("\n\n")}

==================================================
COMMUNICATION & CONVERSATION RULES
==================================================
1. You represent ONLY ${biz.name} (${biz.category}). NEVER assume you are a salon or receptionist unless the category is explicitly "Salon". If you are a bakery, speak as a bakery assistant; if crochet/crafts, speak as a handmade artist; if retail/clothing, speak as a boutique seller.
2. Reply naturally and concisely (usually 1 to 4 sentences) — perfectly formatted for Instagram DMs and WhatsApp messages.
3. Be truthful to the catalog and business details provided. If an item or price is known, provide it directly. If an item or price is not in the catalog, politely give general pricing guidance or state you can take a custom inquiry for the owner.
4. If a customer is ready to order or book:
   - For orders (cakes, crochet, retail, clothing): ask for their item specifications (size/flavor/color/quantity), date needed, and delivery address.
   - For salon/appointments: ask for service, preferred date, time, customer name, and phone number.
5. If the customer asks about payments or deposits, explain the payment method (${biz.paymentInfo || (biz.upiId ? `UPI to ${biz.upiId}` : 'online/UPI/cash')}) accurately.
6. Never sound like a generic robotic bot. Never output JSON or technical debug tags in the final response.`;
}

// =====================================================
// INVENTORY & PRODUCT HELPERS
// =====================================================

async function getInventoryFromDatabase(profileId) {
    const resolvedProfileId = profileId || PROFILE_ID;
    const { data, error } = await supabase
        .from("inventory")
        .select("id, name, category, price, stock, low_stock_threshold")
        .eq("profile_id", resolvedProfileId)
        .order("name", { ascending: true });

    if (error) {
        console.error("INVENTORY LOAD ERROR:", error);
        return [];
    }
    return data || [];
}

async function findProductInDatabase(productName, profileId) {
    if (!productName) return null;
    const resolvedProfileId = profileId || PROFILE_ID;
    const wanted = cleanServiceName(productName);

    const products = await getInventoryFromDatabase(resolvedProfileId);
    if (!products || !products.length) return null;

    const exact = products.find(p => cleanServiceName(p.name) === wanted);
    if (exact) return exact;

    const partial = products.find(p => {
        const cleanName = cleanServiceName(p.name);
        return cleanName.includes(wanted) || wanted.includes(cleanName);
    });

    return partial || null;
}


// =====================================================
// CUSTOMER DATABASE HELPER
// =====================================================

async function findOrCreateCustomer({
    profileId,
    name,
    phone
}) {

    if (!profileId || !phone) {
        console.log(
            "Ã¢Å¡Â Ã¯Â¸Â Customer not created: missing profileId or phone"
        );
        return null;
    }

    const cleanPhone = String(phone).trim();

    // Find existing customer
    const {
        data: existingCustomer,
        error: findError
    } = await supabase
        .from("customers")
        .select("*")
        .eq("profile_id", profileId)
        .eq("phone", cleanPhone)
        .maybeSingle();

    if (findError) {

        console.error(
            "CUSTOMER LOOKUP ERROR:",
            findError
        );

        return null;
    }

    // Customer already exists
    if (existingCustomer) {

        // Update name if we now have a better one
        if (
            name &&
            name !== "Customer" &&
            name !== "Instagram Customer"
        ) {

            await supabase
                .from("customers")
                .update({
                    name: name
                })
                .eq(
                    "id",
                    existingCustomer.id
                );
        }

        console.log(
            "Ã°Å¸â€˜Â¤ Existing customer found:",
            existingCustomer.name
        );

        return existingCustomer;
    }

    // Create new customer
    const {
        data: newCustomer,
        error: createError
    } = await supabase
        .from("customers")
        .insert({

            profileId: activeInstagramProfileId,

            name:
                name ||
                "Customer",

            phone:
                cleanPhone,

            total_visits: 0,

            total_spent: 0

        })
        .select()
        .single();

    if (createError) {

        console.error(
            "CUSTOMER CREATION ERROR:",
            createError
        );

        return null;
    }

    console.log(
        "Ã°Å¸â€˜Â¤ New customer created:",
        newCustomer.name
    );

    return newCustomer;
}

// =====================================================
// PAYMENT HELPERS
// =====================================================

function buildUPILink(
    bookingId,
    service
) {

    const amount =
        ADVANCE_AMOUNT.toFixed(2);

    const note =
        encodeURIComponent(
            `${BUSINESS.name} - ${service || "Appointment"} - ${bookingId.substring(0, 8)}`
        );

    return (
        `upi://pay?pa=${encodeURIComponent(UPI_ID)}` +
        `&pn=${encodeURIComponent(BUSINESS.name)}` +
        `&am=${amount}` +
        `&cu=INR` +
        `&tn=${note}`
    );

}


function buildPaymentUrl(bookingId) {

    return (
        `${PUBLIC_BASE_URL}/payment/${encodeURIComponent(bookingId)}`
    );

}
// =====================================================
// CREATE RAZORPAY PAYMENT LINK
// =====================================================

async function createRazorpayPaymentLink(
    booking,
    profileName
) {

    const paymentLink =
        await razorpay.paymentLink.create({

            amount:
                ADVANCE_AMOUNT * 100,

            currency:
                "INR",

            accept_partial:
                false,

            reference_id:
                booking.id,

            description:
                `${BUSINESS.name} - ${booking.service} appointment advance`,

            customer: {

                name:
                    booking.customer_name ||
                    profileName ||
                    "Customer",

                contact:
    booking.phone &&
    booking.phone.length >= 8 &&
    booking.phone.length <= 14
        ? booking.phone
        : undefined

            },

            notify: {

                sms: false,

                email: false,

                whatsapp: false

            },

            reminder_enable:
                false

        });


    console.log(
        "================================="
    );

    console.log(
        "RAZORPAY PAYMENT LINK CREATED"
    );

    console.log(
        "Booking:",
        booking.id
    );

    console.log(
        "Payment Link:",
        paymentLink.short_url
    );

    console.log(
        "================================="
    );


    return paymentLink;

}


// =====================================================
// HTML ESCAPE
// =====================================================

function escapeHtml(value) {

    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


// =====================================================
// AI #1
// UNDERSTAND CUSTOMER
// =====================================================

async function understandCustomer(
    message,
    phone,
    profileName,
    profileId
) {

    const biz = await getBusinessProfile(profileId);

    const history =
        getConversation(phone);

    const historyText =
        history.length
            ? history
                .map(
                    item =>
                        `${item.role}: ${item.content}`
                )
                .join("\n")
            : "No previous conversation.";

    const today =
        getIndiaDate();

    const completion =
        await client.chat.completions.create({

            model: AI_MODEL,

            response_format: {
                type: "json_object"
            },

            messages: [

                {
                    role: "system",

                    content: `
You are the conversation-understanding intelligence layer for "${biz.name}" (Category: ${biz.category}).

You are NOT speaking to the customer.

Your job is to understand the customer's message using the current message AND the previous conversation.

Return ONLY valid JSON.

Schema:

{
    "intent": "",
    "customer_name": "",
    "phone": "",
    "service": "",
    "product_name": "",
    "booking_date": "",
    "booking_time": "",
    "question": "",
    "payment_confirmation": false
}

Possible intents:

greeting
booking
order
pricing
products
services
custom_order
delivery
hours
location
faq
payment_confirmation
cancel
reschedule
unknown

IMPORTANT CONVERSATION RULES:

If the customer says something that continues
an existing booking conversation, keep the
previously known service/date/time.

Example:

Customer:
"I want a haircut tomorrow."

Assistant:
"What time would you prefer?"

Customer:
"2pm"

The second message is STILL a booking intent.

Return:

{
    "intent": "booking",
    "service": "Haircut",
    "booking_date": "actual date",
    "booking_time": "14:00"
}

If customer says:

"PAID"
"payment done"
"I paid"
"done with payment"
"Ã¢â€šÂ¹500 paid"
"advance paid"

and there is a pending booking context,
return:

"intent": "payment_confirmation"
"payment_confirmation": true

DATE:

Today in India is:

${today}

Convert relative dates such as:

today
tomorrow
day after tomorrow
Monday
next Sunday

into the actual date.

booking_date MUST be:

YYYY-MM-DD

TIME:

booking_time MUST be:

HH:MM

24-hour format.

Do not invent missing information.

If something is unknown, return an empty string.

Customer name:

${profileName || ""}

Instagram customer identifier:

${phone}

IMPORTANT:
The Instagram customer identifier above is NOT the customer's phone number.

Only return a value in "phone" if the customer has explicitly provided
their actual phone number in the conversation.

Never use the Instagram customer identifier as the customer's phone number.

Previous conversation:

${historyText}

Current message:

${message}

Return ONLY JSON.
`
                },

                {
                    role: "user",
                    content: message
                }

            ]

        });


    // ==========================================
// SAFELY READ AI RESPONSE
// ==========================================

if (
    !completion ||
    !completion.choices ||
    !completion.choices.length ||
    !completion.choices[0].message
) {

    console.error(
        "Ã¢ÂÅ’ AI RESPONSE DID NOT CONTAIN CHOICES:"
    );

    console.error(
        JSON.stringify(
            completion,
            null,
            2
        )
    );

    throw new Error(
        "AI did not return a valid response."
    );

}


console.log("Ã°Å¸â€Â INSTAGRAM HUMAN REPLY RAW AI RESPONSE:");
console.log(JSON.stringify(completion, null, 2));

let content =
    completion?.choices?.[0]?.message?.content;

console.log("Ã°Å¸â€Â INSTAGRAM HUMAN REPLY CONTENT:");
console.log(content);

if (!content) {
    console.error(
        "Ã¢ÂÅ’ INSTAGRAM HUMAN REPLY CONTENT IS EMPTY"
    );

    throw new Error(
        "AI returned an empty response."
    );
}


    content =
        content
            .replace(/```json/gi, "")
            .replace(/```/g, "")
            .trim();


    try {

        return JSON.parse(content);

    }

    catch (error) {

        console.error(
            "AI JSON ERROR:",
            content
        );

        throw new Error(
            "AI returned invalid JSON."
        );

    }

}


// =====================================================
// FIND PENDING BOOKING
// =====================================================

async function findPendingBooking(phone, profileId) {

    const resolvedProfileId = profileId || PROFILE_ID;

    const {
        data,
        error
    } = await supabase

        .from("bookings")

        .select("*")

        .eq(
            "profile_id",
            resolvedProfileId
        )

        .eq(
            "phone",
            phone
        )

        .eq(
            "status",
            "Pending"
        )

        .eq(
            "advance_payment_status",
            "Pending"
        )

        .order(
            "created_at",
            {
                ascending: false
            }
        )

        .limit(1);


    if (error) {

        console.error(
            "PENDING BOOKING ERROR:",
            error
        );

        return null;

    }

    return data && data.length
        ? data[0]
        : null;

}


// =====================================================
// AI #2
// HUMAN RESPONSE GENERATOR
// =====================================================

async function generateHumanReply({
    customerMessage,
    customerName,
    intent,
    booking,
    systemResult,
    phone,
    profileId
}) {

    // Load live business profile from DB (falls back to BUSINESS const if missing)
    const biz = await getBusinessProfile(profileId);

    const history = getConversation(phone);

    const historyText = history.length
        ? history
            .map(item => `${item.role}: ${item.content}`)
            .join("\n")
        : "No previous conversation.";

    const prompt = `
CUSTOMER'S LATEST MESSAGE:
${customerMessage}

CUSTOMER NAME:
${customerName || "Customer"}

CURRENT INTENT:
${intent}

CURRENT BOOKING / ORDER CONTEXT:
${biz.isSalon
    ? `Service: ${booking?.service || ""}
Date: ${booking?.booking_date || ""}
Time: ${booking?.booking_time || ""}`
    : `Product: ${booking?.service || booking?.product_name || ""}
Order Status: ${booking?.status || ""}`
}

WHAT THE BUSINESS SYSTEM ACTUALLY DID:
${systemResult}

PREVIOUS CONVERSATION:
${historyText}

BUSINESS INFORMATION:
Name: ${biz.name}
Address: ${biz.address}
Phone: ${biz.phone}
Hours: ${biz.hours}
${biz.description ? `About: ${biz.description}` : ""}

SERVICE / PRODUCT INFORMATION:
Use ONLY the information provided in "WHAT THE BUSINESS SYSTEM ACTUALLY DID".
Do not invent service names, product names, or prices.
`;

    const completion =
        await client.chat.completions.create({

            model: AI_MODEL,

            temperature: 0.75,

            messages: [

                {
                    role: "system",
                    content: buildAISystemPrompt(biz) + `

==================================================
BOOKING & PAYMENT RULES
==================================================

NEVER claim that a booking or order was created, confirmed, cancelled, or paid
unless SYSTEM RESULT explicitly says so.

SYSTEM RESULT is the source of truth for payment confirmation.

Never invent: availability, prices, services, products, discounts, staff information.

==================================================
IMPORTANT — NEVER MENTION
==================================================

AI, bot, chatbot, JSON, database, backend, API, intent, automation, model.
Never say: "According to our system." / "Your request has been processed."

==================================================
FINAL RESPONSE
==================================================

Return ONLY the response message for the customer.
No analysis. No JSON. No explanation. No quotation marks.
`
                },

                {
                    role: "user",
                    content: prompt
                }

            ]
        });


    const reply =
        completion
            .choices[0]
            .message
            .content
            ?.trim();

    if (!reply) {
        throw new Error("AI returned an empty response.");
    }

    return reply;
}


// =====================================================
// ENSURE INSTAGRAM TOKEN IS VALID
// =====================================================

async function getInstagramAccessToken(profileId) {

    const {
        data: profile,
        error
    } = await supabase
        .from("profiles")
        .select(
            "instagram_access_token, instagram_token_expires_at"
        )
        .eq("id", profileId)
        .single();

    if (
        error ||
        !profile?.instagram_access_token
    ) {
        console.error(
            "Ã¢ÂÅ’ Instagram token not found:",
            error
        );

        throw new Error(
            "Instagram account is not connected."
        );
    }

    const token =
        profile.instagram_access_token;

    const expiresAt =
        profile.instagram_token_expires_at
            ? new Date(
                profile.instagram_token_expires_at
              ).getTime()
            : null;

    // -----------------------------------------
    // NO EXPIRY STORED
    // -----------------------------------------

    if (!expiresAt) {
        console.warn(
            "Ã¢Å¡Â Ã¯Â¸Â Instagram token has no expiry date."
        );

        return token;
    }

    const now =
        Date.now();

    const sevenDays =
        7 * 24 * 60 * 60 * 1000;

    const timeRemaining =
        expiresAt - now;

    // -----------------------------------------
    // TOKEN STILL HAS MORE THAN 7 DAYS
    // -----------------------------------------

    if (timeRemaining > sevenDays) {
        return token;
    }

    // -----------------------------------------
    // TOKEN EXPIRED
    // -----------------------------------------

    if (timeRemaining <= 0) {

        console.error(
            "Ã¢ÂÅ’ Instagram access token has expired."
        );

        throw new Error(
            "Instagram access token expired. Please reconnect Instagram."
        );
    }

    // -----------------------------------------
    // REFRESH TOKEN
    // -----------------------------------------

    console.log(
        "Ã°Å¸â€â€ž Instagram token is close to expiry. Refreshing..."
    );

    const refreshUrl =
        "https://graph.instagram.com/refresh_access_token?" +
        new URLSearchParams({
            grant_type:
                "ig_refresh_token",

            access_token:
                token
        }).toString();

    const refreshResponse =
        await fetch(refreshUrl);

    const refreshData =
        await refreshResponse.json();

    console.log(
        "Ã°Å¸â€œÂ¸ Instagram refresh response:",
        {
            ok: refreshResponse.ok,
            expires_in:
                refreshData.expires_in,
            has_token:
                !!refreshData.access_token
        }
    );

    if (
        !refreshResponse.ok ||
        !refreshData.access_token
    ) {
        console.error(
            "Ã¢ÂÅ’ Instagram token refresh failed:",
            refreshData
        );

        throw new Error(
            "Instagram token refresh failed. Please reconnect Instagram."
        );
    }

    const newExpiresIn =
        Number(
            refreshData.expires_in ||
            5184000
        );

    const newExpiresAt =
        new Date(
            Date.now() +
            newExpiresIn * 1000
        ).toISOString();

    const {
        error: updateError
    } = await supabase
        .from("profiles")
        .update({
            instagram_access_token:
                refreshData.access_token,

            instagram_token_expires_at:
                newExpiresAt
        })
        .eq(
            "id",
            profileId
        );

    if (updateError) {

        console.error(
            "Ã¢ÂÅ’ Failed to save refreshed Instagram token:",
            updateError
        );

        throw updateError;
    }

    console.log(
        "Ã¢Å“â€¦ Instagram token refreshed successfully"
    );

    console.log(
        "Ã¢ÂÂ³ New Instagram token expires:",
        newExpiresAt
    );

    return refreshData.access_token;
}

// =====================================================
// SEND INSTAGRAM MESSAGE
// =====================================================

async function sendInstagramMessage(
    recipientId,
    message,
    profileId
) {

    if (!profileId) {
        throw new Error(
            "Instagram profile ID is required."
        );
    }

    const accessToken =
    await getInstagramAccessToken(
        profileId
    );

    const response =
        await fetch(
            "https://graph.instagram.com/v23.0/me/messages",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Authorization":
    `Bearer ${accessToken}`
                },

                body: JSON.stringify({
                    recipient: {
                        id: recipientId
                    },

                    message: {
                        text: message
                    }
                })
            }
        );

    const data =
        await response.json();

    if (!response.ok) {

        console.error(
            "Ã¢ÂÅ’ Instagram send message failed:",
            data
        );

        throw new Error(
            JSON.stringify(data)
        );
    }

    console.log(
        "Ã¢Å“â€¦ Instagram reply sent:",
        data
    );

    return data;
}

// =====================================================
// SEND INSTAGRAM IMAGE
// =====================================================

async function sendInstagramImage(
    recipientId,
    imageUrl,
    profileId
) {
    if (!profileId) {
        throw new Error(
            "Instagram profile ID is required."
        );
    }

    const accessToken =
        await getInstagramAccessToken(
            profileId
        );

    const response =
        await fetch(
            "https://graph.instagram.com/v23.0/me/messages",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Authorization":
                        `Bearer ${accessToken}`
                },

                body: JSON.stringify({
                    recipient: {
                        id: recipientId
                    },

                    message: {
                        attachment: {
                            type: "image",
                            payload: {
                                url: imageUrl,
                                is_reusable: true
                            }
                        }
                    }
                })
            }
        );

    const data =
        await response.json();

    if (!response.ok) {
        console.error(
            "Ã¢ÂÅ’ Instagram send image failed:",
            data
        );

        throw new Error(
            JSON.stringify(data)
        );
    }

    console.log(
        "Ã¢Å“â€¦ Instagram image sent:",
        data
    );

    return data;
}

// =====================================================
// PAYMENT CONFIRMATION
// =====================================================

async function confirmAdvancePayment(phone) {

    const pendingBooking =
        await findPendingBooking(phone);

    if (!pendingBooking) {

        return {
            success: false,
            message:
                "No pending booking found."
        };

    }

    return {
        success: false,
        message:
            "Payment cannot be confirmed from a customer message. Waiting for Razorpay verification."
    };
}

// =====================================================
// WHATSAPP WEBHOOK
// =====================================================

app.post(
    "/whatsapp",
    async (req, res) => {

        try {

            // Dynamic profile routing: ?profile=PROFILE_ID in webhook URL
            const activeProfileId =
                req.query.profile ||
                PROFILE_ID;

            const message =
                (req.body.Body || "")
                    .trim();


            const phone =
                (
                    req.body.From ||
                    ""
                )
                    .replace(
                        "whatsapp:",
                        ""
                    );


            const profileName =
                req.body.ProfileName ||
                "";


            console.log(
                "\n================================"
            );

            console.log(
                "NEW WHATSAPP MESSAGE"
            );

            console.log(
                "Name:",
                profileName
            );

            console.log(
                "Phone:",
                phone
            );

            console.log(
                "Message:",
                message
            );

            console.log(
                "================================"
            );


            if (!message) {

                return res.type("text/xml").status(200).send("<Response></Response>");

            }


            // Save customer message
            addConversation(
                phone,
                "customer",
                message
            );


            // =================================================
            // UNDERSTAND CUSTOMER
            // =================================================

            const booking =
                await understandCustomer(
                    message,
                    phone,
                    profileName,
                    activeProfileId
                );


            console.log(
                "AI UNDERSTANDING:"
            );

            console.log(
                booking
            );


            let systemResult = "";


            // =================================================
            // PAYMENT CONFIRMATION
            // =================================================

            if (
                booking.intent ===
                    "payment_confirmation"
                ||
                booking.payment_confirmation === true
            ) {

                console.log(
                    "PAYMENT CONFIRMATION REQUEST"
                );


                const paymentResult =
                    await confirmAdvancePayment(
                        phone
                    );


                if (
                    !paymentResult.success
                ) {

                    systemResult = `

The customer says they have paid.

However, there is no pending booking
that can be matched to this customer.

Do NOT say the payment was received.

Tell them you could not find a pending
appointment and ask them to contact the
salon if needed.

`;

                }

                else {

                    const confirmed =
                        paymentResult.booking;


                    systemResult = `

The customer's pending booking has been
confirmed after their payment confirmation.

Payment:
Ã¢â€šÂ¹${ADVANCE_AMOUNT}

Payment method:
UPI

Booking is now CONFIRMED.

Service:
${confirmed.service}

Date:
${formatDateForCustomer(
                        confirmed.booking_date
                    )}

Time:
${formatTimeForCustomer(
                        confirmed.booking_time
                    )}

Total service price:
Ã¢â€šÂ¹${await getServicePrice(
                        confirmed.service
                    )}

Advance paid:
Ã¢â€šÂ¹${ADVANCE_AMOUNT}

Remaining balance:
Ã¢â€šÂ¹${confirmed.balance_amount}

Tell the customer naturally that their
appointment is confirmed.

Do NOT ask for the advance again.

`;

                }

            }


            // =================================================
            // BOOKING
            // =================================================

            else if (
                booking.intent ===
                "booking"
            ) {

                console.log(
                    "BOOKING REQUEST"
                );


                // =====================================================
// RESOLVE SERVICE FROM DATABASE
// =====================================================

if (booking.service) {

    const dbService =
        await findServiceInDatabase(
            booking.service,
            activeProfileId
        );

    if (dbService) {

        booking.service =
            dbService.name;

        console.log(
            "SERVICE FROM DATABASE:",
            dbService
        );

    } else {

        console.log(
            "SERVICE NOT FOUND:",
            booking.service
        );

    }
}


                const service = booking.service;
                const missing = [];


                if (!service) {

                    missing.push(
                        "service"
                    );

                }


                if (!booking.booking_date) {

                    missing.push(
                        "date"
                    );

                }


                if (!booking.booking_time) {

                    missing.push(
                        "time"
                    );

                }


                // =================================================
                // MISSING INFORMATION
                // =================================================

                if (
                    missing.length > 0
                ) {

                    systemResult = `

The customer wants to make a booking.

The booking has NOT been created yet.

Missing information:

${missing.join(", ")}

Use the previous conversation and ask
naturally only for the information that
is actually missing.

Do not sound like a form.

`;

                }


                // =================================================
                // CREATE PENDING BOOKING
                // =================================================

                else {

                    console.log(
                        "Creating pending booking..."
                    );


                    const existingPending =
                        await findPendingBooking(
                            phone,
                            activeProfileId
                        );


                    // If the customer already has
                    // a pending payment booking,
                    // don't create duplicates.

                    if (
                        existingPending
                        &&
                        existingPending.booking_date ===
                            booking.booking_date
                        &&
                        existingPending.booking_time ===
                            booking.booking_time
                    ) {

                        const paymentLink =
    await createRazorpayPaymentLink(
        existingPending,
        profileName
    );


                        systemResult = `

A pending booking already exists.

Booking ID:
${existingPending.id}

Service:
${existingPending.service}

Date:
${formatDateForCustomer(
                            existingPending.booking_date
                        )}

Time:
${formatTimeForCustomer(
                            existingPending.booking_time
                        )}

Appointment status:
Pending payment

Advance required:
Ã¢â€šÂ¹${ADVANCE_AMOUNT}

Razorpay payment link:
${paymentLink.short_url}

Ask the customer naturally to complete
the Ã¢â€šÂ¹500 advance using the payment link.

Do NOT ask them to reply PAID.


Do NOT say the appointment is confirmed.

`;

                    }

                    else {

                        const servicePrice = await getServicePrice(service);

                        const {
                            data: createdBooking,
                            error
                        } = await supabase

                            .from("bookings")

                            .insert({

                                profile_id:
                                    activeProfileId,

                                customer_name:
                                    booking.customer_name ||
                                    profileName ||
                                    "Customer",

                                phone:
                                    phone,

                                service:
                                    service,

                                booking_date:
                                    booking.booking_date,

                                booking_time:
                                    booking.booking_time,

                                status:
                                    "Pending",

                                source:
                                    "WhatsApp",

                                notes:
                                    null,

                                intent:
                                    "booking",

                                raw_message:
                                    message,

                                advance_required:
                                    true,

                                advance_amount:
                                    ADVANCE_AMOUNT,

                                advance_paid:
                                    0,

                                advance_payment_method:
                                    "Razorpay",

                                advance_payment_status:
                                    "Pending",

                                balance_amount:
                                    Math.max(
                                        servicePrice -
                                        ADVANCE_AMOUNT,
                                        0
                                    ),

                            })

                            .select()
                            .single();


                        if (error) {

                            console.error(
                                "BOOKING INSERT ERROR:",
                                error
                            );


                            systemResult = `

The booking could not be created because
of a database error.

Do NOT tell the customer that their
appointment was booked.

Apologize naturally and ask them to
try again.

`;

                        }

                        else {

                            console.log(
                                "PENDING BOOKING CREATED:",
                                createdBooking.id
                            );

                            await findOrCreateCustomer({
    profileId: activeProfileId,
    name:
        booking.customer_name ||
        profileName ||
        "Customer",
    phone: phone
});


                            const paymentLink =
    await createRazorpayPaymentLink(
        createdBooking,
        profileName
    );


                            systemResult = `

A booking has been successfully created
but it is NOT confirmed yet.

The customer must pay a Ã¢â€šÂ¹500 advance.

Booking ID:
${createdBooking.id}

Service:
${service}

Date:
${formatDateForCustomer(
                                createdBooking.booking_date
                            )}

Time:
${formatTimeForCustomer(
                                createdBooking.booking_time
                            )}

Service price:
Ã¢â€šÂ¹${servicePrice}

Advance:
Ã¢â€šÂ¹${ADVANCE_AMOUNT}

Razorpay payment link:
${paymentLink.short_url}

Remaining balance after advance:
Ã¢â€šÂ¹${Math.max(
    servicePrice -
    ADVANCE_AMOUNT,
    0
)}

Tell the customer naturally that the
slot is reserved pending the Ã¢â€šÂ¹500 advance.

Tell them to complete the Ã¢â€šÂ¹500 payment
using the payment link.

Do NOT ask them to reply "PAID".


Do NOT say the appointment is confirmed.

`;

                        }

                    }

                }

            }


            // =================================================
            // CANCEL
            // =================================================

            else if (
                booking.intent ===
                "cancel"
            ) {

                const {
                    data: cancelBookings,
                    error: cancelError
                } = await supabase

                    .from("bookings")

                    .select("*")

                    .eq(
                        "profile_id",
                        PROFILE_ID
                    )

                    .eq(
                        "phone",
                        phone
                    )

                    .eq(
                        "status",
                        "Confirmed"
                    )

                    .order(
                        "created_at",
                        {
                            ascending: false
                        }
                    );


                if (cancelError) {

                    console.error(
                        "CANCELLATION ERROR:",
                        cancelError
                    );


                    systemResult = `

The cancellation could not be completed.

Do not say the appointment was cancelled.

`;

                }

                else if (
                    !cancelBookings ||
                    cancelBookings.length === 0
                ) {

                    systemResult = `

No confirmed appointment was found
for this customer.

Do not say anything was cancelled.

Ask naturally for more information
if needed.

`;

                }

                else {

                    let matchingBooking =
                        cancelBookings[0];


                    if (
                        booking.service
                    ) {

                        const requestedService =
                            normalizeService(
                                booking.service
                            );


                        const serviceMatch =
                            cancelBookings.find(
                                item =>
                                    normalizeService(
                                        item.service
                                    )
                                    .toLowerCase() ===
                                    requestedService
                                        .toLowerCase()
                            );


                        if (serviceMatch) {

                            matchingBooking =
                                serviceMatch;

                        }

                    }


                    const {
                        error: updateError
                    } =
                        await supabase

                            .from("bookings")

                            .update({

                                status:
                                    "Cancelled"

                            })

                            .eq(
                                "id",
                                matchingBooking.id
                            );


                    if (updateError) {

                        console.error(
                            updateError
                        );


                        systemResult = `

The appointment could not be cancelled.

Do not say it was cancelled.

`;

                    }

                    else {

                        systemResult = `

The appointment was successfully cancelled.

Service:
${matchingBooking.service}

Date:
${formatDateForCustomer(
                            matchingBooking.booking_date
                        )}

Time:
${formatTimeForCustomer(
                            matchingBooking.booking_time
                        )}

Tell the customer naturally that the
appointment has been cancelled.

`;

                    }

                }

            }


            // =================================================
            // RESCHEDULE
            // =================================================

            else if (
                booking.intent ===
                "reschedule"
            ) {

                systemResult = `

The customer wants to reschedule.

Automatic rescheduling is not implemented
yet.

Do NOT pretend that it was rescheduled.

Explain naturally that you can help them
with the change but the appointment needs
to be checked first.

`;

            }


            // =================================================
            // PRICING
            // =================================================

            else if (
    booking.intent === "pricing"
) {

    let service = null;

    if (booking.service) {

        service =
            await findServiceInDatabase(
                booking.service
            );
    }

    if (service) {

        systemResult = `
The customer asked about:

${service.name}

Actual price from the services database:
Ã¢â€šÂ¹${Number(service.price).toLocaleString("en-IN")}

Item type:
${service.item_type}

GST rate:
${service.gst_rate || 0}%

Answer naturally and briefly.
Do not invent another price.
`;

    } else {

        systemResult = `
The customer asked about pricing but
did not specify a particular service.

Ask which service they are interested in.
`;

    }
}

            // =================================================
            // SERVICES
            // =================================================

            else if (
    booking.intent === "services"
) {

    const services =
        await getServicesFromDatabase();

    if (!services.length) {

        systemResult = `
No active services are currently available
in the services database.

Tell the customer you're unable to display
the menu right now and ask them to try again.
`;

    } else {

    systemResult = `
The customer asked for the salon's service menu.

Send them the salon's service menu link:

https://saloon-zarah.onrender.com/menu.pdf

Tell the customer naturally that they can view the complete service menu using the link.

Do NOT list all services in the message.
Do NOT invent any services or prices.
`;
}
}

            // =================================================
            // PRODUCTS / INVENTORY & STOCK
            // =================================================

            else if (
                booking.intent === "products" ||
                booking.product_name
            ) {
                const searchProduct = booking.product_name || booking.service || message;
                const dbProduct = await findProductInDatabase(searchProduct, activeProfileId);
                const allProducts = await getInventoryFromDatabase(activeProfileId);

                if (dbProduct) {
                    const inStock = (Number(dbProduct.stock) || 0) > 0;
                    systemResult = `
The customer asked about the product: "${dbProduct.name}".
Product Details from Inventory Database:
- Name: ${dbProduct.name}
- Category: ${dbProduct.category || "General"}
- Price: ₹${dbProduct.price}
- Stock Status: ${inStock ? `In Stock (${dbProduct.stock} available)` : "Currently Out of Stock"}

Respond naturally to the customer with the exact price and availability.
If in stock, tell them how they can order or purchase it.
`;
                } else if (allProducts && allProducts.length > 0) {
                    const productListText = allProducts
                        .slice(0, 10)
                        .map(p => `- ${p.name} (₹${p.price}) - ${Number(p.stock) > 0 ? "In Stock" : "Out of Stock"}`)
                        .join("\n");

                    systemResult = `
The customer is asking about available products/services.
Available Products in Inventory Database:
${productListText}

Tell the customer what we currently carry and their prices.
Do NOT invent products that are not listed here.
`;
                } else {
                    systemResult = `
The customer asked about products or services, but nothing is currently listed in the catalog.
Tell the customer politely that the catalog is being updated and offer to answer any other questions.
`;
                }
            }
            // =================================================
            // HOURS
            // =================================================

            else if (
    booking.intent === "hours"
) {
    const bizProfile = await getBusinessProfile(activeProfileId);
    systemResult = `
The business is open during these hours:

${bizProfile.hours || BUSINESS.hours}

Answer naturally.
`;
}


            // =================================================
            // LOCATION
            // =================================================

            else if (
    booking.intent === "location"
) {
    const bizProfile = await getBusinessProfile(activeProfileId);
    systemResult = `
The business is located at:

${bizProfile.address || BUSINESS.address}

Answer naturally.
`;
}


            // =================================================
            // GREETING
            // =================================================

            else if (
                booking.intent ===
                "greeting"
            ) {

                systemResult = `

The customer is greeting the receptionist.

Respond naturally and ask how you can help.

`;

            }


            // =================================================
            // FAQ / UNKNOWN
            // =================================================

            else {

                systemResult = `

The customer asked a general question.

Use the available business information
to answer naturally.

If the information is unavailable,
be honest and offer to help with:

- bookings
- services
- pricing
- opening hours
- location

Do not invent information.

`;

            }


            // =================================================
            // GENERATE HUMAN RESPONSE
            // =================================================

            const reply =
                await generateHumanReply({

                    customerMessage:
                        message,

                    customerName:
                        booking.customer_name ||
                        profileName,

                    intent:
                        booking.intent,

                    booking:
                        booking,

                    systemResult:
                        systemResult,

                    phone:
                        phone,

                    profileId:
                        activeProfileId

                });


            // =================================================
            // SAVE BOT RESPONSE
            // =================================================

            addConversation(
                phone,
                "assistant",
                reply
            );


            console.log(
                "\nFINAL HUMAN REPLY:"
            );

            console.log(
                reply
            );
            // =====================================================
// GENERATE MENU PDF FROM SERVICES DATABASE
// =====================================================

// async function generateMenuPDF() {

//     const services =
//         await getServicesFromDatabase();

//     return new Promise(
//         (resolve, reject) => {

//             try {

//                 const doc =
//                     new PDFDocument({
//                         size: "A4",
//                         margin: 45
//                     });

//                 const chunks = [];

//                 doc.on(
//                     "data",
//                     chunk =>
//                         chunks.push(chunk)
//                 );

//                 doc.on(
//                     "end",
//                     () =>
//                         resolve(
//                             Buffer.concat(chunks)
//                         )
//                 );

//                 doc.on(
//                     "error",
//                     reject
//                 );


//                 // HEADER

//                 doc
//                     .fontSize(25)
//                     .font("Helvetica-Bold")
//                     .fillColor("#111111")
//                     .text(
//                         BUSINESS.name,
//                         {
//                             align: "center"
//                         }
//                     );

//                 doc
//                     .moveDown(0.3)
//                     .fontSize(12)
//                     .font("Helvetica")
//                     .fillColor("#777777")
//                     .text(
//                         "SALON & SPA Ã¢â‚¬Â¢ SERVICE MENU",
//                         {
//                             align: "center"
//                         }
//                     );

//                 doc
//                     .moveDown(0.5)
//                     .fontSize(9)
//                     .text(
//                         BUSINESS.address,
//                         {
//                             align: "center"
//                         }
//                     );

//                 doc
//                     .text(
//                         `${BUSINESS.phone} Ã¢â‚¬Â¢ ${BUSINESS.hours}`,
//                         {
//                             align: "center"
//                         }
//                     );

//                 doc.moveDown(2);


//                 // GROUP SERVICES

//                 const grouped = {};

//                 services.forEach(
//                     service => {

//                         const category =
//                             service.item_type ===
//                             "product"
//                                 ? "PRODUCTS"
//                                 : "SERVICES";

//                         if (
//                             !grouped[category]
//                         ) {
//                             grouped[category] = [];
//                         }

//                         grouped[
//                             category
//                         ].push(service);
//                     }
//                 );


//                 Object.entries(
//                     grouped
//                 ).forEach(
//                     (
//                         [
//                             category,
//                             items
//                         ]
//                     ) => {

//                         doc
//                             .fontSize(16)
//                             .font(
//                                 "Helvetica-Bold"
//                             )
//                             .fillColor("#111111")
//                             .text(
//                                 category
//                             );

//                         doc.moveDown(0.5);


//                         items.forEach(
//                             service => {

//                                 const price =
//                                     Number(
//                                         service.price
//                                     ) || 0;

//                                 doc
//                                     .fontSize(11)
//                                     .font(
//                                         "Helvetica-Bold"
//                                     )
//                                     .text(
//                                         service.name,
//                                         {
//                                             continued:
//                                                 true
//                                         }
//                                     );

//                                 doc
//                                     .font(
//                                         "Helvetica"
//                                     )
//                                     .text(
//                                         `    Ã¢â€šÂ¹${price.toLocaleString("en-IN")}`,
//                                         {
//                                             align:
//                                                 "right"
//                                         }
//                                     );

//                                 doc.moveDown(
//                                     0.4
//                                 );
//                             }
//                         );

//                         doc.moveDown(1);
//                     }
//                 );


//                 doc
//                     .moveDown(2)
//                     .fontSize(9)
//                     .font("Helvetica")
//                     .fillColor("#777777")
//                     .text(
//                         "Prices are based on the current services listed by ZARAH ELITE.",
//                         {
//                             align: "center"
//                         }
//                     );


//                 doc.end();

//             } catch (error) {

//                 reject(error);

//             }
//         }
//     );
// }


            // =================================================
            // SEND WHATSAPP
            // =================================================

            // =================================================
// SEND WHATSAPP
// =================================================

if (booking.intent === "services") {

    await twilioClient.messages.create({

        from:
            process.env.TWILIO_WHATSAPP_NUMBER,

        to:
            req.body.From,

        body:
            "Sure! Ã°Å¸ËœÅ  I've shared our service menu. Have a look and let me know what you'd like to book."

    });


    await twilioClient.messages.create({

        from:
            process.env.TWILIO_WHATSAPP_NUMBER,

        to:
            req.body.From,

        body:
            "ZARAH ELITE Service Menu",

        mediaUrl: [
            `${PUBLIC_BASE_URL}/menu.pdf`
        ]

    });


    console.log(
        "Ã¢Å“â€¦ Fixed ZARAH ELITE menu PDF sent."
    );

}
else {

    await twilioClient.messages.create({

        from:
            process.env.TWILIO_WHATSAPP_NUMBER,

        to:
            req.body.From,

        body:
            reply

    });


    console.log(
        "WhatsApp reply sent."
    );
}


            return res.type("text/xml").status(200).send("<Response></Response>");

        }

        catch (error) {

            console.error(
                "\n================================"
            );

            console.error(
                "SERVER ERROR:"
            );

            console.error(
                error
            );

            console.error(
                "================================"
            );


            try {

                if (req.body.From) {

                    await twilioClient.messages.create({

                        from:
                            process.env.TWILIO_WHATSAPP_NUMBER,

                        to:
                            req.body.From,

                        body:
                            "Sorry, I ran into a small issue. Could you try that again? Ã°Å¸ËœÅ "

                    });

                }

            }

            catch (twilioError) {

                console.error(
                    "TWILIO FALLBACK ERROR:",
                    twilioError
                );

            }


            return res.type("text/xml").status(200).send("<Response></Response>");

        }

    }
);


// =====================================================
// PAYMENT PAGE
// =====================================================

app.get(
    "/payment/:bookingId",
    async (req, res) => {

        try {

            const bookingId =
                req.params.bookingId;


            const {
                data: booking,
                error
            } = await supabase

                .from("bookings")

                .select("*")

                .eq(
                    "id",
                    bookingId
                )

                .single();


            if (
                error ||
                !booking
            ) {

                return res.status(404).send(
                    "<h2>Booking not found.</h2>"
                );

            }


            if (
                booking.status ===
                "Confirmed"
            ) {

                return res.send(`

                    <!DOCTYPE html>

                    <html>

                    <head>

                        <meta name="viewport"
                              content="width=device-width, initial-scale=1">

                        <title>Booking Confirmed</title>

                    </head>

                    <body style="
                        font-family:Arial;
                        padding:40px;
                        text-align:center;
                        background:#f5f7fa;
                    ">

                        <div style="
                            max-width:420px;
                            margin:auto;
                            background:white;
                            padding:30px;
                            border-radius:16px;
                        ">

                            <h2>Booking Confirmed Ã¢Å“â€œ</h2>

                            <p>
                                Your appointment is already confirmed.
                            </p>

                        </div>

                    </body>

                    </html>

                `);

            }


            const upiLink =
                buildUPILink(
                    booking.id,
                    booking.service
                );


            res.send(`

                <!DOCTYPE html>

                <html>

                <head>

                    <meta
                        name="viewport"
                        content="width=device-width, initial-scale=1"
                    >

                    <title>
                        Bella Salon - Advance Payment
                    </title>

                </head>


                <body style="
                    margin:0;
                    font-family:Arial,sans-serif;
                    background:#f5f7fa;
                    padding:30px 15px;
                ">


                    <div style="
                        max-width:430px;
                        margin:auto;
                        background:white;
                        border-radius:18px;
                        padding:30px;
                        box-shadow:0 10px 30px rgba(0,0,0,.08);
                    ">


                        <h2 style="
                            margin-top:0;
                            color:#172033;
                        ">
                            Bella Salon
                        </h2>


                        <p style="
                            color:#667085;
                        ">
                            Appointment advance payment
                        </p>


                        <hr>


                        <p>
                            <strong>Service:</strong>
                            ${escapeHtml(booking.service)}
                        </p>


                        <p>
                            <strong>Date:</strong>
                            ${escapeHtml(
                                formatDateForCustomer(
                                    booking.booking_date
                                )
                            )}
                        </p>


                        <p>
                            <strong>Time:</strong>
                            ${escapeHtml(
                                formatTimeForCustomer(
                                    booking.booking_time
                                )
                            )}
                        </p>


                        <div style="
                            background:#fff4ef;
                            padding:18px;
                            border-radius:12px;
                            margin:20px 0;
                        ">

                            <div style="
                                color:#667085;
                                font-size:14px;
                            ">
                                Advance required
                            </div>

                            <div style="
                                font-size:30px;
                                font-weight:bold;
                                margin-top:5px;
                            ">
                                Ã¢â€šÂ¹500
                            </div>

                        </div>


                        <p>
                            UPI ID:
                            <strong>
                                ${escapeHtml(UPI_ID)}
                            </strong>
                        </p>


                        <a
                            href="${upiLink}"
                            style="
                                display:block;
                                text-decoration:none;
                                text-align:center;
                                background:#e98272;
                                color:white;
                                padding:15px;
                                border-radius:10px;
                                font-weight:bold;
                                margin-top:20px;
                            "
                        >
                            Pay Ã¢â€šÂ¹500 via UPI
                        </a>


                        <p style="
                            color:#667085;
                            font-size:13px;
                            line-height:1.5;
                            margin-top:20px;
                        ">
                            After completing the payment,
                            return to WhatsApp and reply
                            <strong>PAID</strong>.
                        </p>


                        <p style="
                            color:#98a2b3;
                            font-size:11px;
                        ">
                            Booking ID:
                            ${escapeHtml(booking.id)}
                        </p>


                    </div>


                </body>

                </html>

            `);

        }

        catch (error) {

            console.error(
                "PAYMENT PAGE ERROR:",
                error
            );

            res.status(500).send(
                "<h2>Unable to load payment page.</h2>"
            );

        }

    }
);

// =====================================================
// INSTAGRAM WEBHOOK VERIFICATION
// =====================================================

app.get("/instagram/webhook", (req, res) => {

    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (
        mode === "subscribe" &&
        token === process.env.INSTAGRAM_VERIFY_TOKEN
    ) {

        console.log("Ã¢Å“â€¦ Instagram webhook verified");

        return res
            .status(200)
            .send(challenge);
    }

    console.error("Ã¢ÂÅ’ Instagram webhook verification failed");

    return res.sendStatus(403);
});

// =====================================================
// INSTAGRAM WEBHOOK
// =====================================================


// app.post("/instagram/webhook", async (req, res) => {

//     // Always acknowledge Meta immediately
//     res.sendStatus(200);

//     try {

//         console.log("\n================================");
//         console.log("Ã°Å¸â€œÂ© NEW INSTAGRAM WEBHOOK");
//         console.log(JSON.stringify(req.body, null, 2));
//         console.log("================================");

//         const entries = req.body?.entry || [];

//         for (const entry of entries) {

//             const messaging = entry?.messaging || [];

//             for (const event of messaging) {

//     console.log(
//         "Ã°Å¸â€Å½ Instagram event keys:",
//         Object.keys(event)
//     );

//     // -----------------------------------------
//     // IGNORE NON-MESSAGE EVENTS
//     // -----------------------------------------

//     if (
//         event.message_reactions ||
//         event.reaction ||
//         event.read ||
//         event.postback ||
//         event.message_edit
//     ) {
//         console.log(
//             "Ã¢â€žÂ¹Ã¯Â¸Â Ignoring non-message Instagram event"
//         );

//         continue;
//     }

//     // -----------------------------------------
//     // NORMAL INSTAGRAM MESSAGE
//     // -----------------------------------------

//     const senderId =
//         event.sender?.id;

//     const message =
//         event.message?.text?.trim();

//     // -----------------------------------------
//     // CHECK MESSAGE
//     // -----------------------------------------

//     if (!senderId || !message) {

//         console.log(
//             "Ã¢Å¡Â Ã¯Â¸Â Instagram message missing sender/text:"
//         );

//         console.log(
//             JSON.stringify(
//                 event,
//                 null,
//                 2
//             )
//         );

//         continue;
//     }

//     console.log(
//         "Ã°Å¸â€œÂ¨ Instagram sender:",
//         senderId
//     );

//     console.log(
//         "Ã°Å¸â€™Â¬ Instagram message:",
//         message
//     );

//                 // -----------------------------------------
//                 // CONVERSATION MEMORY
//                 // -----------------------------------------

//                 const instagramPhone =
//                     `instagram:${senderId}`;

//                 addConversation(
//                     instagramPhone,
//                     "customer",
//                     message
//                 );

//                 // -----------------------------------------
//                 // AI UNDERSTANDING
//                 // -----------------------------------------

//                 const booking =
//                     await understandCustomer(
//                         message,
//                         instagramPhone,
//                         ""
//                     );

//                 console.log(
//                     "Ã°Å¸Â¤â€“ INSTAGRAM AI UNDERSTANDING:"
//                 );

//                 console.log(
//                     booking
//                 );

//                 // -----------------------------------------
//                 // SYSTEM RESULT
//                 // -----------------------------------------

//                 const systemResult = `
// The customer contacted the salon through Instagram.

// Customer message:
// ${message}

// Intent:
// ${booking?.intent || ""}

// Service:
// ${booking?.service || ""}

// Date:
// ${booking?.booking_date || ""}

// Time:
// ${booking?.booking_time || ""}

// Respond naturally and helpfully.

// Do not invent:
// - services
// - prices
// - availability
// - bookings
// - payments
// `;

//                 // -----------------------------------------
//                 // HUMAN REPLY
//                 // -----------------------------------------

//                 const reply =
//                     await generateHumanReply({
//                         customerMessage: message,
//                         customerName:
//                             booking?.customer_name || "",
//                         intent:
//                             booking?.intent || "",
//                         booking:
//                             booking || {},
//                         systemResult:
//                             systemResult,
//                         phone:
//                             instagramPhone
//                     });

//                 console.log(
//                     "Ã°Å¸Â¤â€“ Instagram AI reply:",
//                     reply
//                 );

//                 // -----------------------------------------
//                 // SAVE REPLY
//                 // -----------------------------------------

//                 addConversation(
//                     instagramPhone,
//                     "assistant",
//                     reply
//                 );

//                 // -----------------------------------------
//                 // SEND INSTAGRAM REPLY
//                 // -----------------------------------------

//                 await sendInstagramMessage(
//                     senderId,
//                     reply
//                 );

//                 console.log(
//                     "Ã¢Å“â€¦ Instagram reply completed"
//                 );
//             }
//         }

//     }
//     catch (error) {

//         console.error(
//             "\nÃ¢ÂÅ’ INSTAGRAM WEBHOOK ERROR:"
//         );

//         console.error(error);

//     }

// });

// =====================================================
// INSTAGRAM WEBHOOK
// =====================================================

// =====================================================
// INSTAGRAM CONNECT - START OAUTH
// =====================================================

app.get("/api/instagram/connect", async (req, res) => {

    try {

        const {
            data: {
                user
            },
            error
        } = await supabase.auth.getUser(
            req.headers.authorization?.replace("Bearer ", "")
        );

        if (error || !user) {
            return res.status(401).send(
                "Please log in first."
            );
        }

        const profileId = user.id;

        const redirectUri =
            `${process.env.PUBLIC_BASE_URL}/api/instagram/callback`;

        const authUrl =
            "https://www.instagram.com/oauth/authorize" +
            `?client_id=${process.env.INSTAGRAM_APP_ID}` +
            `&redirect_uri=${encodeURIComponent(redirectUri)}` +
            `&response_type=code` +
            `&scope=instagram_business_basic,instagram_business_manage_messages` +
            `&state=${profileId}`;

        res.json({ authUrl });

    } catch (error) {

        console.error(
            "Instagram connect error:",
            error
        );

        res.status(500).send(
            "Could not start Instagram connection."
        );
    }
});

// =====================================================
// INSTAGRAM CONNECT - OAUTH CALLBACK
// =====================================================

app.get("/api/instagram/callback", async (req, res) => {
    try {

        const { code, state, error, error_reason } = req.query;

        // -----------------------------------------
        // USER CANCELLED / META ERROR
        // -----------------------------------------

        if (error) {
            console.error(
                "Ã¢ÂÅ’ Instagram OAuth error:",
                error,
                error_reason
            );

            return res.status(400).send(`
                <h2>Instagram connection cancelled</h2>
                <p>You can close this window and try again.</p>
            `);
        }

        // -----------------------------------------
        // REQUIRED PARAMETERS
        // -----------------------------------------

        if (!code || !state) {
            return res.status(400).send(
                "Missing Instagram authorization data."
            );
        }

        const profileId = state;

        const redirectUri =
            `${process.env.PUBLIC_BASE_URL}/api/instagram/callback`;

        // -----------------------------------------
        // EXCHANGE CODE FOR ACCESS TOKEN
        // -----------------------------------------

        const tokenResponse = await fetch(
            "https://api.instagram.com/oauth/access_token",
            {
                method: "POST",
                headers: {
                    "Content-Type":
                        "application/x-www-form-urlencoded"
                },
                body: new URLSearchParams({
                    client_id:
                        process.env.INSTAGRAM_APP_ID,

                    client_secret:
                        process.env.INSTAGRAM_APP_SECRET,

                    grant_type:
                        "authorization_code",

                    redirect_uri:
                        redirectUri,

                    code:
                        code
                })
            }
        );

        const tokenData =
            await tokenResponse.json();

        console.log(
            "Ã°Å¸â€œÂ¸ Instagram token response:",
            tokenData
        );

        if (
            !tokenResponse.ok ||
            !tokenData.access_token
        ) {
            console.error(
                "Ã¢ÂÅ’ Instagram token exchange failed:",
                tokenData
            );

            return res.status(400).send(`
                <h2>Instagram connection failed</h2>
                <p>Could not obtain an Instagram access token.</p>
            `);
        }

        const shortLivedToken = tokenData.access_token;

// =====================================================
// EXCHANGE SHORT-LIVED TOKEN FOR LONG-LIVED TOKEN
// =====================================================

const longLivedResponse = await fetch(
    "https://graph.instagram.com/access_token?" +
    new URLSearchParams({
        grant_type: "ig_exchange_token",
        client_secret: process.env.INSTAGRAM_APP_SECRET,
        access_token: shortLivedToken
    }).toString()
);

const longLivedData =
    await longLivedResponse.json();

console.log(
    "Ã°Å¸â€œÂ¸ Instagram long-lived token response:",
    {
        ok: longLivedResponse.ok,
        expires_in: longLivedData.expires_in,
        has_token: !!longLivedData.access_token
    }
);

if (
    !longLivedResponse.ok ||
    !longLivedData.access_token
) {
    console.error(
        "Ã¢ÂÅ’ Instagram long-lived token exchange failed:",
        longLivedData
    );

    return res.status(400).send(`
        <h2>Instagram connection failed</h2>
        <p>Could not create a long-lived Instagram connection.</p>
    `);
}

const accessToken =
    longLivedData.access_token;

const expiresIn =
    Number(longLivedData.expires_in || 5184000);

const tokenExpiresAt =
    new Date(
        Date.now() + expiresIn * 1000
    ).toISOString();

console.log(
    "Ã¢Å“â€¦ Instagram long-lived token obtained"
);

console.log(
    "Ã¢ÂÂ³ Instagram token expires:",
    tokenExpiresAt
);

// =====================================================
// GET INSTAGRAM ACCOUNT ID
// =====================================================

// =====================================================
// GET INSTAGRAM ACCOUNT ID
// =====================================================

const meResponse = await fetch(
    `https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=${encodeURIComponent(accessToken)}`
);

const meData = await meResponse.json();

console.log(
    "Ã°Å¸â€œÂ¸ Instagram /me:",
    meData
);

if (
    !meResponse.ok ||
    !meData.user_id
) {
    console.error(
        "Ã¢ÂÅ’ Could not get Instagram account ID:",
        meData
    );

    return res.status(400).send(`
        <h2>Instagram connection failed</h2>
        <p>Could not identify the Instagram account.</p>
    `);
}

const instagramUserId =
    meData.user_id;

        // -----------------------------------------
        // SAVE CONNECTION TO PROFILE
        // -----------------------------------------

        const {
            error: saveError
        } = await supabase
            .from("profiles")
            .update({
    instagram_access_token:
        accessToken,

    instagram_user_id:
        instagramUserId,

    instagram_connected:
        true,

    instagram_token_expires_at:
        tokenExpiresAt
})
            .eq(
                "id",
                profileId
            );

        if (saveError) {

            console.error(
                "Ã¢ÂÅ’ Instagram connection save failed:",
                saveError
            );

            return res.status(500).send(`
                <h2>Instagram connection failed</h2>
                <p>Instagram was authorized, but we couldn't save the connection.</p>
            `);
        }

        console.log(
            "================================="
        );

        console.log(
            "Ã¢Å“â€¦ INSTAGRAM CONNECTED"
        );

        console.log(
            "Profile:",
            profileId
        );

        console.log(
            "Instagram User ID:",
            instagramUserId
        );

        console.log(
            "================================="
        );

        // -----------------------------------------
        // SUCCESS
        // -----------------------------------------

        return res.send(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Instagram Connected</title>
                <style>
                    body {
                        font-family: Arial, sans-serif;
                        text-align: center;
                        padding: 60px 20px;
                    }

                    h2 {
                        color: #111;
                    }

                    p {
                        color: #666;
                    }
                </style>
            </head>

            <body>

                <h2>Ã¢Å“â€¦ Instagram connected successfully</h2>

                <p>
                    Your Instagram account is now connected
                    to your Kangro salon dashboard.
                </p>

                <p>
                    You can close this window.
                </p>

            </body>
            </html>
        `);

    } catch (error) {

        console.error(
            "Ã¢ÂÅ’ Instagram callback error:",
            error
        );

        return res.status(500).send(`
            <h2>Instagram connection failed</h2>
            <p>Please try connecting again.</p>
        `);
    }
});


app.post("/instagram/webhook", async (req, res) => {

    // Always acknowledge Meta immediately
    res.sendStatus(200);

    try {

        console.log("\n================================");
        console.log("Ã°Å¸â€œÂ© NEW INSTAGRAM WEBHOOK");
        console.log(JSON.stringify(req.body, null, 2));
        console.log("================================");

        const entries = req.body?.entry || [];

        for (const entry of entries) {
            const instagramBusinessId =
    entry?.id;

const {
    data: matchingProfiles,
    error: instagramProfileError
} = await supabase
    .from("profiles")
    .select("id, instagram_user_id, instagram_connected, business_name")
    .eq(
        "instagram_user_id",
        String(instagramBusinessId)
    )
    .eq(
        "instagram_connected",
        true
    )
    .order("created_at", { ascending: false })
    .limit(1);

if (instagramProfileError) {
    console.error(
        "â Œ Instagram profile lookup error:",
        instagramProfileError
    );

    continue;
}

let instagramProfile = matchingProfiles && matchingProfiles.length > 0 ? matchingProfiles[0] : null;
if (!instagramProfile && PROFILE_ID) {
    const { data: fallbackProf } = await supabase
        .from("profiles")
        .select("id, instagram_user_id, instagram_connected, business_name")
        .eq("id", PROFILE_ID)
        .maybeSingle();
    if (fallbackProf) {
        instagramProfile = fallbackProf;
        console.log("ℹ️ Fallback to default Kangro profile for Instagram:", fallbackProf.business_name || fallbackProf.id);
    }
}
if (!instagramProfile) {
    console.error(
        "❌ No Kangro profile found for Instagram account:",
        instagramBusinessId
    );
    continue;
}

console.log(
    "Ã¢Å“â€¦ Kangro Instagram profile matched:",
    instagramProfile
);

const activeInstagramProfileId =
    instagramProfile.id;

            const messaging = entry?.messaging || [];

            for (const event of messaging) {

                console.log(
                    "📨 Instagram event keys:",
                    Object.keys(event)
                );

                // -----------------------------------------
                // IGNORE NON-CUSTOMER EVENTS
                // -----------------------------------------

                if (
                    event.message?.is_echo ||
                    event.message_reactions ||
                    event.reaction ||
                    event.read ||
                    event.postback ||
                    event.message_edit
                ) {

                    console.log(
                        "↩️ Ignoring non-customer Instagram event"
                    );

                    continue;
                }

                // -----------------------------------------
                // GET CUSTOMER DETAILS & ATTACHMENTS
                // -----------------------------------------

                const senderId =
                    event.sender?.id;

                if (!senderId) {
                    console.log(
                        "⚠️ Instagram event missing sender id"
                    );
                    continue;
                }

                const instagramPhone =
                    `instagram:${senderId}`;

                // -----------------------------------------
                // DETECT PAYMENT SCREENSHOT / IMAGE ATTACHMENT
                // -----------------------------------------

                const attachments =
                    event.message?.attachments || [];

                const imageAttachment =
                    attachments.find(a => a.type === "image");

                const proofImageUrl =
                    imageAttachment?.payload?.url;

                if (proofImageUrl) {

                    console.log(
                        "📸 Detected payment screenshot / image from Instagram customer:",
                        proofImageUrl
                    );

                    // Find most recent booking for this Instagram user & profile
                    let { data: matchedBooking } =
                        await supabase
                            .from("bookings")
                            .select("*")
                            .eq("profile_id", activeInstagramProfileId)
                            .or(`instagram_user_id.eq.${senderId},phone.eq.instagram:${senderId}`)
                            .order("created_at", { ascending: false })
                            .limit(1)
                            .maybeSingle();

                    if (!matchedBooking) {
                        // Fallback: most recent booking on this profile
                        const { data: latestPending } = await supabase
                            .from("bookings")
                            .select("*")
                            .eq("profile_id", activeInstagramProfileId)
                            .order("created_at", { ascending: false })
                            .limit(1)
                            .maybeSingle();
                        matchedBooking = latestPending;
                    }

                    if (matchedBooking) {
                        const { error: updateError } =
                            await supabase
                                .from("bookings")
                                .update({
                                    payment_status: "Payment Screenshot Received",
                                    payment_proof_image: proofImageUrl,
                                    payment_proof_timestamp: new Date().toISOString(),
                                    instagram_user_id: senderId
                                })
                                .eq("id", matchedBooking.id);

                        if (!updateError) {
                            console.log(
                                "✅ Payment screenshot attached to booking (awaiting seller manual confirmation):",
                                matchedBooking.id
                            );
                        } else {
                            console.error("❌ Error updating payment screenshot on booking:", updateError);
                        }
                    } else {
                        // Create an inquiry booking with the screenshot attached
                        await supabase
                            .from("bookings")
                            .insert({
                                profile_id: activeInstagramProfileId,
                                customer_name: "Instagram Customer",
                                phone: `instagram:${senderId}`,
                                instagram_user_id: senderId,
                                service: "Custom Order (Screenshot attached)",
                                status: "pending",
                                payment_status: "Payment Screenshot Received",
                                payment_proof_image: proofImageUrl,
                                payment_proof_timestamp: new Date().toISOString(),
                                booking_date: new Date().toISOString().split("T")[0],
                                source: "Instagram DM"
                            });
                    }

                    const igBiz = await getBusinessProfile(activeInstagramProfileId);
                    const ackMessage = `Thank you! 📸 We've received your payment screenshot.\n\nOur team is reviewing it and will confirm your order shortly! 🙏\n\n— ${igBiz.name}`;

                    try {
                        await sendInstagramMessage(
                            senderId,
                            ackMessage,
                            activeInstagramProfileId
                        );

                        addConversation(
                            instagramPhone,
                            "assistant",
                            ackMessage
                        );
                    } catch (sendErr) {
                        console.error("Failed to send screenshot acknowledgement message:", sendErr);
                    }

                    continue;
                }
                // -----------------------------------------
                // GET TEXT MESSAGE
                // -----------------------------------------

                const message =
                    event.message?.text?.trim();

                if (!message) {

                    console.log(
                        "Ã¢Å¡Â Ã¯Â¸Â Instagram message missing text"
                    );

                    continue;
                }

                console.log(
                    "Ã°Å¸â€œÂ¨ Instagram sender:",
                    senderId
                );

                console.log(
                    "Ã°Å¸â€™Â¬ Instagram message:",
                    message
                );

                // -----------------------------------------
                // SAVE CUSTOMER MESSAGE
                // -----------------------------------------

                addConversation(
                    instagramPhone,
                    "customer",
                    message
                );

                // -----------------------------------------
                // AI UNDERSTANDING
                // -----------------------------------------

                const booking =
                    await understandCustomer(
                        message,
                        instagramPhone,
                        "",
                        activeInstagramProfileId
                    );

                console.log(
                    "Ã°Å¸Â¤â€“ INSTAGRAM AI UNDERSTANDING:"
                );

                console.log(booking);

                // -----------------------------------------
                // BOOKING LOGIC
                // -----------------------------------------

                let systemResult = "";

                // =================================================
                // PAYMENT CONFIRMATION
                // =================================================

                if (
                    booking?.intent ===
                    "payment_confirmation"
                ) {

                    const paymentResult =
                        await confirmAdvancePayment(
                            instagramPhone
                        );

                    systemResult = `
The customer contacted the salon through Instagram.

Payment confirmation result:
${paymentResult.message}

Do not invent payment information.
Do not say the booking is confirmed unless the payment result says so.
`;

                }

                // =================================================
                // BOOKING
                // =================================================

                else if (
                    booking?.intent ===
                    "booking"
                ) {

                    const missing = [];

                    if (!booking.service) {
                        missing.push("service");
                    }

                    if (!booking.booking_date) {
                        missing.push("date");
                    }

                    if (!booking.booking_time) {
                        missing.push("time");
                    }

                    // -----------------------------------------
                    // MISSING INFORMATION
                    // -----------------------------------------

                    if (missing.length > 0) {

                        systemResult = `
The customer wants to make a booking.

The booking has NOT been created yet.

Missing information:
${missing.join(", ")}

Ask naturally only for the missing information.

Do not say the appointment is confirmed.
Do not invent availability.
`;

                    }

                    // -----------------------------------------
                    // COMPLETE BOOKING -> CONFIRMED DIRECTLY
                    // -----------------------------------------

                    else {

                        console.log(
                            "📋 Complete Instagram booking details received"
                        );

                        const service =
                            booking.service;

                        const servicePrice =
                            await getServicePrice(service, activeInstagramProfileId);

                        const customerName =
                            booking.customer_name ||
                            profileName ||
                            "Instagram Customer";

                        // -----------------------------------------
                        // CHECK EXISTING CONFIRMED BOOKING
                        // -----------------------------------------

                        const { data: existingBooking } =
                            await supabase
                                .from("bookings")
                                .select("*")
                                .eq("profile_id", activeInstagramProfileId)
                                .eq("instagram_user_id", senderId)
                                .eq("booking_date", booking.booking_date)
                                .eq("booking_time", booking.booking_time)
                                .maybeSingle();

                        if (existingBooking) {

                            console.log(
                                "⚠️ Existing booking found for slot:",
                                existingBooking.id
                            );

                            systemResult = `
A booking already exists for this customer.

Booking ID:
${existingBooking.id}

Service:
${existingBooking.service}

Date:
${formatDateForCustomer(existingBooking.booking_date)}

Time:
${formatTimeForCustomer(existingBooking.booking_time)}

Status:
Confirmed ✅

Tell the customer naturally that their appointment is already booked for this date and time.
Let them know the total bill (₹${servicePrice}) is to be paid when they visit the salon / at the time of service.
Do NOT ask for advance payment.
Do NOT send a payment link or QR code.
`;

                        }

                        // -----------------------------------------
                        // CREATE NEW CONFIRMED BOOKING
                        // -----------------------------------------

                        else {

                            console.log(
                                "📌 Creating confirmed Instagram booking..."
                            );

                            const {
                                data: createdBooking,
                                error: bookingInsertError
                            } = await supabase

                                .from("bookings")

                                .insert({

                                    profile_id: activeInstagramProfileId,

                                    customer_name: customerName,

                                    phone: (booking.phone && booking.phone !== instagramPhone) ? booking.phone : null,

                                    instagram_user_id: senderId,

                                    service: service,

                                    booking_date: booking.booking_date,

                                    booking_time: booking.booking_time,

                                    status: "Confirmed",

                                    source: "Instagram",

                                    notes: null,

                                    intent: "booking",

                                    raw_message: message,

                                    advance_required: false,

                                    advance_amount: 0,

                                    advance_paid: 0,

                                    advance_payment_status: "Not Required",

                                    payment_status: "Payment Not Requested",

                                    balance_amount: servicePrice

                                })

                                .select()
                                .single();


                            // -----------------------------------------
                            // DATABASE ERROR
                            // -----------------------------------------

                            if (bookingInsertError) {

                                console.error(
                                    "❌ INSTAGRAM BOOKING INSERT ERROR:",
                                    bookingInsertError
                                );

                                systemResult = `
The booking could not be created because of a temporary database error.

Do not say the appointment was booked.

Apologize naturally and ask the customer to try again.
`;

                            }

                            // -----------------------------------------
                            // BOOKING CONFIRMED
                            // -----------------------------------------

                            else {

                                console.log(
                                    "✅ INSTAGRAM BOOKING CONFIRMED & SAVED:",
                                    createdBooking.id
                                );

                                await findOrCreateCustomer({
                                    profileId: activeInstagramProfileId,
                                    name: customerName,
                                    phone: (booking.phone && booking.phone !== instagramPhone) ? booking.phone : `instagram:${senderId}`
                                });

                                const igBizProfile = await getBusinessProfile(activeInstagramProfileId);

                                systemResult = `
The booking has been successfully confirmed and saved in the database!

Booking ID: ${createdBooking.id}
Customer: ${customerName}
Service: ${service}
Date: ${formatDateForCustomer(createdBooking.booking_date)}
Time: ${formatTimeForCustomer(createdBooking.booking_time)}
Total Bill: ₹${servicePrice}

Tell the customer warmly and clearly that their appointment is CONFIRMED!
State the total bill amount (₹${servicePrice}) and that payment is to be made when they visit the ${igBizProfile.category === "Salon" ? "salon" : "store / upon delivery"}.

CRITICAL RULES:
- Do NOT ask for any advance payment.
- Do NOT ask for a payment screenshot.
- Do NOT send any QR code or payment link.
- Simply confirm their slot with warm wishes!
`;
                            }
                        }
                    }
                }

                // =================================================
                // OTHER INSTAGRAM MESSAGE
                // =================================================
                // =================================================
// INSTAGRAM SERVICES
// =================================================

else if (
    booking?.intent === "services"
) {
    const igBiz = await getBusinessProfile(activeInstagramProfileId);
    if (igBiz.isSalon) {
    systemResult = `
The customer is asking for the business's service menu.

The complete current service menu is available here:

https://saloon-zarah.onrender.com/menu.pdf

Tell the customer naturally that they can view the complete service menu using this link.

Send the URL exactly as provided.

Do NOT list individual services or prices in the message.
Do NOT invent any services or prices.
`;
    } else {
        const allProds = await getInventoryFromDatabase(activeInstagramProfileId);
        if (allProds && allProds.length > 0) {
            const prodText = allProds.slice(0, 10).map(p => `- ${p.name} (₹${p.price}) - ${Number(p.stock) > 0 ? "In Stock" : "Made to Order"}`).join("\n");
            systemResult = `
The customer is asking about available products.
Available Products:
${prodText}

Tell the customer about what we sell and their prices in a friendly way.
`;
        } else {
            systemResult = `
The customer is asking about products or services.
Tell the customer that the catalog is being updated and to DM for the latest availability and pricing.
`;
        }
    }
}

                else if (
                    booking?.intent === "products" ||
                    booking?.product_name
                ) {
                    const searchProduct = booking.product_name || booking.service || message;
                    const dbProduct = await findProductInDatabase(searchProduct, activeInstagramProfileId);
                    const allProducts = await getInventoryFromDatabase(activeInstagramProfileId);

                    if (dbProduct) {
                        const inStock = (Number(dbProduct.stock) || 0) > 0;
                        systemResult = `
The customer asked about the product: "${dbProduct.name}".
Product Details from Inventory Database:
- Name: ${dbProduct.name}
- Category: ${dbProduct.category || "General"}
- Price: ₹${dbProduct.price}
- Stock Status: ${inStock ? `In Stock (${dbProduct.stock} available)` : "Currently Out of Stock / Made to Order"}

Respond naturally to the customer with the exact price and stock availability.
`;
                    } else if (allProducts && allProducts.length > 0) {
                        const productListText = allProducts
                            .slice(0, 10)
                            .map(p => `- ${p.name} (₹${p.price}) - ${Number(p.stock) > 0 ? "In Stock" : "Out of Stock"}`)
                            .join("\n");

                        systemResult = `
Available Products in Inventory Database:
${productListText}

Tell the customer what products we currently carry and their prices.
`;
                    } else {
                        systemResult = `
The customer asked about products or services, but nothing is currently listed in the catalog.
Tell the customer politely that the catalog is being updated and offer to answer any other questions.
`;
                    }
                }

                else {
                    const igBizFallback = await getBusinessProfile(activeInstagramProfileId);
                    systemResult = `
The customer contacted ${igBizFallback.name} through Instagram.

Customer message:
${message}

Intent:
${booking?.intent || ""}

${igBizFallback.isSalon
    ? `Service: ${booking?.service || ""}\nDate: ${booking?.booking_date || ""}\nTime: ${booking?.booking_time || ""}`
    : `Product/Order: ${booking?.service || booking?.product_name || ""}`
}

Respond naturally and helpfully.

Do not invent:
- services or products
- prices
- availability
- bookings or payments
`;
                }

                // -----------------------------------------
                // GENERATE HUMAN REPLY
                // -----------------------------------------

                const reply =
                    await generateHumanReply({
                        customerMessage:
                            message,

                        customerName:
                            booking?.customer_name || "",

                        intent:
                            booking?.intent || "",

                        booking:
                            booking || {},

                        systemResult:
                            systemResult,

                        phone:
                            instagramPhone,

                        profileId:
                            activeInstagramProfileId
                    });

                console.log(
                    "🤖 Instagram AI reply:",
                    reply
                );

                // -----------------------------------------
                // SAVE REPLY
                // -----------------------------------------

                addConversation(
                    instagramPhone,
                    "assistant",
                    reply
                );

                // -----------------------------------------
                // SEND INSTAGRAM REPLY
                // -----------------------------------------

                await sendInstagramMessage(
                    senderId,
                    reply,
                    activeInstagramProfileId
                );

                console.log(
                    "✅ Instagram reply completed"
                );
            }
        }
    }

    catch (error) {

        console.error(
            "\nÃ¢ÂÅ’ INSTAGRAM WEBHOOK ERROR:"
        );

        console.error(error);
    }

});



// =====================================================
// GENERATE BILL PDF
// =====================================================

async function generateBillPDF(bill, items, profileData) {
    return new Promise((resolve, reject) => {
        try {
            const doc = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
            const chunks = [];
            doc.on("data", chunk => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", reject);

            const L = 40;   // left margin
            const R = 555;  // right edge
            const W = R - L; // content width

            // Use profile data if passed, else fall back to BUSINESS constants
            const bizName    = profileData?.business_name    || BUSINESS.name;
            const bizAddress = profileData?.business_address || BUSINESS.address;
            const bizPhone   = profileData?.business_phone   || BUSINESS.phone || "";
            const bizGst     = bill.seller_gstin             || "";

            const invoiceNo = bill.invoice_number
                ? `#${bill.invoice_number}`
                : `#${bizName} ${new Date().getFullYear()} - ${String(bill.id || "").substring(0, 8).toUpperCase()}`;

            const invoiceDateRaw = bill.invoice_date || bill.created_at;
            const invoiceDate = invoiceDateRaw
                ? new Date(invoiceDateRaw).toLocaleString("en-IN", {
                    day: "2-digit", month: "short", year: "numeric",
                    hour: "2-digit", minute: "2-digit", hour12: true
                  })
                : "";

            const INR = v => `\u20B9${Number(v || 0).toLocaleString("en-IN", { minimumFractionDigits: 1, maximumFractionDigits: 2 })}`;

            // Ã¢â€â‚¬Ã¢â€â‚¬ HEADER Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            const headerY = doc.y;

            // Left: logo box + business info
            doc.rect(L, headerY, 32, 32).strokeColor("#aaaaaa").stroke();
            doc.fontSize(10).font("Helvetica-Bold").fillColor("#555555")
               .text("ZE", L + 7, headerY + 10, { width: 32, align: "center" });

            doc.fontSize(14).font("Helvetica-Bold").fillColor("#000000")
               .text(bizName, L + 38, headerY, { width: 280 });

            doc.fontSize(9).font("Helvetica").fillColor("#444444")
               .text(bizAddress, L + 38, doc.y, { width: 280 });

            if (bizPhone) {
                doc.text(`Ph: ${bizPhone}`, L + 38, doc.y, { width: 280 });
            }
            if (bizGst) {
                doc.text(`GST#${bizGst}`, L + 38, doc.y, { width: 280 });
            }

            // Right: INVOICE heading + invoice number + date
            doc.fontSize(18).font("Helvetica-Bold").fillColor("#000000")
               .text("INVOICE", L + 360, headerY, { width: W - 360, align: "right" });

            doc.fontSize(9).font("Helvetica").fillColor("#444444")
               .text(invoiceNo, L + 360, doc.y, { width: W - 360, align: "right" });

            doc.text(invoiceDate, L + 360, doc.y, { width: W - 360, align: "right" });

            // Ã¢â€â‚¬Ã¢â€â‚¬ DIVIDER Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            const divY = Math.max(doc.y, headerY + 70) + 8;
            doc.moveTo(L, divY).lineTo(R, divY).strokeColor("#cccccc").lineWidth(1).stroke();

            // Ã¢â€â‚¬Ã¢â€â‚¬ BILL TO Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            let curY = divY + 10;
            doc.fontSize(9).font("Helvetica-Bold").fillColor("#666666")
               .text("Bill To", L, curY);

            curY = doc.y + 2;
            doc.fontSize(10).font("Helvetica-Bold").fillColor("#000000")
               .text(`Name   ${(bill.customer_name || "-").toUpperCase()}`, L, curY);

            curY = doc.y + 1;
            doc.fontSize(10).font("Helvetica").fillColor("#333333")
               .text(`Phone  ${bill.phone || "-"}`, L, curY);

            // Ã¢â€â‚¬Ã¢â€â‚¬ ITEMS TABLE HEADER Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            curY = doc.y + 12;
            const col = { sl: L, desc: L + 30, gross: L + 240, qty: L + 330, disc: L + 385, net: L + 455 };

            doc.rect(L, curY, W, 18).fillColor("#f0f0f0").fill();

            const thY = curY + 4;
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#333333");
            doc.text("Sl No",         col.sl,    thY, { width: 28,  align: "center" });
            doc.text("Item Description", col.desc, thY, { width: 200, align: "left" });
            doc.text("Gross Amount",  col.gross, thY, { width: 85,  align: "right" });
            doc.text("Qty",           col.qty,   thY, { width: 45,  align: "center" });
            doc.text("Discount",      col.disc,  thY, { width: 65,  align: "right" });
            doc.text("Net Amount",    col.net,   thY, { width: 95,  align: "right" });

            curY += 18;

            // Ã¢â€â‚¬Ã¢â€â‚¬ ITEMS TABLE ROWS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            let totalGross = 0;
            let totalDiscount = 0;
            let totalNet = 0;

            (items || []).forEach((item, idx) => {
                const grossAmt = Number(item.price || 0) * Number(item.quantity || 1);
                const discAmt  = Number(item.discount || 0);
                const netAmt   = Number(item.total || 0);
                totalGross    += grossAmt;
                totalDiscount += discAmt;
                totalNet      += netAmt;

                const rowY = curY + 4;
                doc.fontSize(9).font("Helvetica").fillColor("#000000");
                doc.text(String(idx + 1), col.sl, rowY, { width: 28, align: "center" });
                doc.text((item.item_name || "-").toUpperCase(), col.desc, rowY, { width: 200 });
                doc.text(INR(grossAmt), col.gross, rowY, { width: 85, align: "right" });
                doc.text(String(item.quantity || 1), col.qty, rowY, { width: 45, align: "center" });
                doc.text(INR(discAmt), col.disc, rowY, { width: 65, align: "right" });
                doc.text(INR(netAmt), col.net, rowY, { width: 95, align: "right" });

                curY += 18;
                doc.moveTo(L, curY).lineTo(R, curY).strokeColor("#e5e5e5").lineWidth(0.5).stroke();
            });

            // Ã¢â€â‚¬Ã¢â€â‚¬ ITEMS TOTAL ROW Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            curY += 2;
            doc.rect(L, curY, W, 18).fillColor("#f7f7f7").fill();
            const totY = curY + 4;
            doc.fontSize(9).font("Helvetica-Bold").fillColor("#000000");
            doc.text("Total", col.desc, totY, { width: 200 });
            doc.text(INR(totalGross), col.gross, totY, { width: 85, align: "right" });
            doc.text(INR(totalDiscount), col.disc, totY, { width: 65, align: "right" });
            doc.text(INR(totalNet), col.net, totY, { width: 95, align: "right" });
            curY += 20;

            // Ã¢â€â‚¬Ã¢â€â‚¬ BOTTOM TWO PANELS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            curY += 10;
            const panelW = (W / 2) - 8;
            const panelR = L + panelW + 16; // right panel x start

            // Panel headers
            doc.rect(L, curY, panelW, 16).fillColor("#e8e8e8").fill();
            doc.rect(panelR, curY, panelW, 16).fillColor("#e8e8e8").fill();

            doc.fontSize(9).font("Helvetica-Bold").fillColor("#333333")
               .text("Payment Details", L + 4, curY + 4, { width: panelW - 8 });
            doc.text("Invoice Summary", panelR + 4, curY + 4, { width: panelW - 8 });

            curY += 16;

            // Payment Details panel Ã¢â‚¬â€ sub-header row
            doc.rect(L, curY, panelW, 14).fillColor("#f5f5f5").fill();
            doc.fontSize(8).font("Helvetica-Bold").fillColor("#555555");
            doc.text("Mode", L + 4, curY + 3, { width: panelW / 2 - 4 });
            doc.text("Amount", L + panelW / 2, curY + 3, { width: panelW / 2 - 4, align: "right" });
            curY += 14;

            // Payment Details panel Ã¢â‚¬â€ payment row
            const payMethod = bill.payment_method || "Cash";
            const grandTotal = Number(bill.total || totalNet);
            const advPaid = Number(bill.advance_paid || 0);
            const amountPaid = advPaid > 0 ? advPaid : grandTotal; // what was actually paid

            doc.fontSize(9).font("Helvetica").fillColor("#000000");
            doc.text(payMethod, L + 4, curY + 3, { width: panelW / 2 - 4 });
            doc.text(INR(grandTotal), L + panelW / 2, curY + 3, { width: panelW / 2 - 4, align: "right" });

            // Invoice Summary panel rows
            const subtotalAmt = Number(bill.subtotal || totalGross);
            const discountAmt = Number(bill.discount || totalDiscount);
            const netAfterDisc = subtotalAmt - discountAmt;
            const totalTax    = Number(bill.total_tax || 0);
            const cgstAmt     = Number(bill.cgst_amount || 0);
            const sgstAmt     = Number(bill.sgst_amount || 0);
            const igstAmt     = Number(bill.igst_amount || 0);
            const cgstRate    = Number(bill.cgst_rate || 0);
            const sgstRate    = Number(bill.sgst_rate || 0);
            const igstRate    = Number(bill.igst_rate || 0);
            const gstRate     = cgstRate + sgstRate + igstRate;

            const summRows = [
                ["Gross Total",              INR(subtotalAmt),   false],
                ["Discount",                 INR(discountAmt),   false],
                ["Net Total (after discount)", INR(netAfterDisc), false],
            ];

            if (totalTax > 0) {
                const gstLabel = gstRate > 0 ? `GST @ ${gstRate}%` : "GST";
                summRows.push([gstLabel, INR(totalTax), false]);
            }
            summRows.push(["Grand Total", INR(grandTotal), true]);

            let summY = curY;
            summRows.forEach(([label, value, bold]) => {
                const rowH = bold ? 18 : 14;
                if (bold) {
                    doc.rect(panelR, summY, panelW, rowH).fillColor("#f0f0f0").fill();
                }
                doc.fontSize(bold ? 9 : 8)
                   .font(bold ? "Helvetica-Bold" : "Helvetica")
                   .fillColor("#000000")
                   .text(label, panelR + 4, summY + (rowH - 9) / 2 + 1, { width: panelW * 0.6 - 4 });
                doc.text(value, panelR + panelW * 0.6, summY + (rowH - 9) / 2 + 1, { width: panelW * 0.4 - 4, align: "right" });
                summY += rowH;
                if (!bold) {
                    doc.moveTo(panelR, summY).lineTo(panelR + panelW, summY).strokeColor("#e5e5e5").lineWidth(0.5).stroke();
                }
            });

            // Draw borders around panels
            const panelEndY = Math.max(summY, curY + 18);
            doc.rect(L, curY - 14 - 16, panelW, panelEndY - (curY - 14 - 16)).strokeColor("#cccccc").lineWidth(0.7).stroke();
            doc.rect(panelR, curY - 14 - 16, panelW, panelEndY - (curY - 14 - 16)).strokeColor("#cccccc").lineWidth(0.7).stroke();

            // Ã¢â€â‚¬Ã¢â€â‚¬ FOOTER Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
            const footerY = panelEndY + 24;
            doc.moveTo(L, footerY).lineTo(R, footerY).strokeColor("#cccccc").lineWidth(1).stroke();
            doc.fontSize(9).font("Helvetica").fillColor("#777777")
               .text(`Thank you for visiting ${bizName}.`, L, footerY + 8, { width: W, align: "center" });
            doc.text("We look forward to seeing you again!", L, doc.y + 2, { width: W, align: "center" });

            doc.end();

        } catch (error) {
            reject(error);
        }
    });
}
// =====================================================
// VIEW BILL PDF
// =====================================================

app.get(
    "/bill/:billId/pdf",
    async (req, res) => {

        try {

            const {
                billId
            } = req.params;


            // GET BILL
            const {
                data: bill,
                error: billError
            } = await supabase
                .from("bills")
                .select("*")
                .eq(
                    "id",
                    billId
                )
                .single();


            if (
                billError ||
                !bill
            ) {

                return res
                    .status(404)
                    .send(
                        "Bill not found."
                    );

            }


            // GET BILL ITEMS
            const {
                data: items,
                error: itemsError
            } = await supabase
                .from("bill_items")
                .select("*")
                .eq(
                    "bill_id",
                    billId
                )
                .order(
                    "created_at",
                    {
                        ascending: true
                    }
                );


            if (itemsError) {

                console.error(
                    "BILL ITEMS ERROR:",
                    itemsError
                );

                return res
                    .status(500)
                    .send(
                        "Unable to load bill items."
                    );

            }

            // GET PROFILE (for business name/address/phone)
            let profileData = null;
            if (bill.profile_id) {
                const { data: prof } = await supabase
                    .from("profiles")
                    .select("business_name, business_address, business_phone")
                    .eq("id", bill.profile_id)
                    .maybeSingle();
                profileData = prof || null;
            }

            // GENERATE PDF
            const pdfBuffer =
                await generateBillPDF(
                    bill,
                    items || [],
                    profileData
                );


            res.setHeader(
                "Content-Type",
                "application/pdf"
            );

            res.setHeader(
                "Content-Disposition",
                `inline; filename="bill-${billId}.pdf"`
            );


            res.send(
                pdfBuffer
            );

        }
        catch (error) {

            console.error(
                "VIEW BILL PDF ERROR:",
                error
            );

            res
                .status(500)
                .send(
                    "Unable to generate bill."
                );

        }

    }
);

// =====================================================
// PUBLIC BILL / INVOICE API (FOR CUSTOMERS)
// =====================================================

app.get("/api/public/bill/:billId", async (req, res) => {
    try {
        const { billId } = req.params;
        if (!billId) {
            return res.status(400).json({ error: "Bill ID is required" });
        }

        const { data: bill, error: billError } = await supabase
            .from("bills")
            .select("*")
            .eq("id", billId)
            .maybeSingle();

        if (billError || !bill) {
            return res.status(404).json({ error: "Invoice not found" });
        }

        const { data: items } = await supabase
            .from("bill_items")
            .select("*")
            .eq("bill_id", billId)
            .order("created_at", { ascending: true });

        let profile = null;
        if (bill.profile_id) {
            const { data: prof } = await supabase
                .from("profiles")
                .select("business_name, business_address, business_phone, upi_id")
                .eq("id", bill.profile_id)
                .maybeSingle();
            profile = prof || null;
        }

        let booking = null;
        if (bill.booking_id) {
            const { data: bk } = await supabase
                .from("bookings")
                .select("*")
                .eq("id", bill.booking_id)
                .maybeSingle();
            booking = bk || null;
        }

        return res.status(200).json({
            success: true,
            bill,
            items: items || [],
            profile,
            booking
        });
    } catch (err) {
        console.error("Public bill fetch error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// =====================================================
// MANUAL BOOKING
// =====================================================

app.post("/api/bookings/manual", async (req, res) => {
    try {
        const { profile_id, customer_name, phone, service, booking_date, booking_time } = req.body;

        if (!profile_id || !customer_name || !service || !booking_date || !booking_time) {
            return res.status(400).json({ error: "Missing required fields" });
        }

        const { data: newBooking, error } = await supabase
            .from("bookings")
            .insert({
                profile_id,
                customer_name,
                phone: phone || null,
                service,
                booking_date,
                booking_time,
                status: "Confirmed",
                source: "Walk-in"
            })
            .select()
            .single();

        if (error) {
            console.error("Manual booking error:", error);
            return res.status(500).json({ error: "Database error" });
        }

        return res.status(200).json({ success: true, booking: newBooking });
    } catch (error) {
        console.error("Manual booking endpoint error:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
});

// =====================================================
// SEND BILL ON WHATSAPP
// =====================================================

app.post(
    "/send-bill",
    async (req, res) => {

        try {

            const {
                billId
            } = req.body;


            if (!billId) {

                return res.status(400).json({

                    error:
                        "Bill ID is required."

                });

            }


            // ==========================================
            // GET BILL
            // ==========================================

            const {
                data: bill,
                error: billError
            } =
                await supabase

                    .from("bills")

                    .select("*")

                    .eq(
                        "id",
                        billId
                    )

                    .single();


            if (
                billError ||
                !bill
            ) {

                console.error(
                    "BILL LOOKUP ERROR:",
                    billError
                );


                return res.status(404).json({

                    error:
                        "Bill not found."

                });

            }


            // ==========================================
            // GET BILL ITEMS
            // ==========================================

            const {
                data: items,
                error: itemsError
            } =
                await supabase

                    .from("bill_items")

                    .select("*")

                    .eq(
                        "bill_id",
                        billId
                    )

                    .order(
                        "created_at",
                        {
                            ascending:true
                        }
                    );


            if (itemsError) {

                console.error(
                    "BILL ITEMS ERROR:",
                    itemsError
                );


                return res.status(500).json({

                    error:
                        "Unable to load bill items."

                });

            }


            // ==========================================
            // GET PROFILE (for business name/address/phone)
            // ==========================================

            let profileData = null;
            if (bill.profile_id) {
                const { data: prof } = await supabase
                    .from("profiles")
                    .select("business_name, business_address, business_phone")
                    .eq("id", bill.profile_id)
                    .maybeSingle();
                profileData = prof || null;
            }

            // ==========================================
            // GENERATE PDF
            // ==========================================

            console.log(
                "Generating bill PDF..."
            );

            const pdfBuffer =
                await generateBillPDF(
                    bill,
                    items,
                    profileData
                );


            console.log(
                "PDF generated:",
                pdfBuffer.length,
                "bytes"
            );


            // ==========================================
            // UPLOAD PDF
            // ==========================================

            const fileName =
                `bill-${bill.id}.pdf`;


            const {
                error: uploadError
            } =
                await supabase.storage

                    .from("bills")

                    .upload(
                        fileName,
                        pdfBuffer,
                        {
                            contentType:
                                "application/pdf",

                            upsert:
                                true
                        }
                    );


            if (uploadError) {

                console.error(
                    "PDF UPLOAD ERROR:",
                    uploadError
                );


                return res.status(500).json({

                    error:
                        "Unable to upload bill PDF."

                });

            }


            const {
                data: publicUrlData
            } =
                supabase.storage

                    .from("bills")

                    .getPublicUrl(
                        fileName
                    );


            const pdfUrl =
                publicUrlData.publicUrl;


            console.log(
                "PDF URL:",
                pdfUrl
            );


            // ==========================================
            // PHONE
            // ==========================================

            let phone = String(bill.phone || "").trim();

if (!phone) {
    return res.status(400).json({
        error: "Customer WhatsApp number is missing."
    });
}

if (phone.startsWith("whatsapp:")) {
    phone = phone.replace("whatsapp:", "").trim();
}

if (phone.startsWith("+91")) {
    // Already in international format
} else if (phone.startsWith("91") && phone.length === 12) {
    phone = `+${phone}`;
} else if (phone.length === 10) {
    phone = `+91${phone}`;
}

const whatsappTo = `whatsapp:${phone}`;

console.log("Ã°Å¸â€œÂ± Sending bill to:", whatsappTo);


            // ==========================================
            // SEND WHATSAPP BILL
            // ==========================================

            console.log(
                "Sending bill to:",
                whatsappTo
            );


            const grossTotal =
    Number(bill.total || 0);

const advancePaid =
    Number(bill.advance_paid || 0);

const balanceDue =
    Math.max(
        grossTotal - advancePaid,
        0
    );

const twilioMessage =
    await twilioClient
        .messages
        .create({

            from:
                process.env.TWILIO_WHATSAPP_NUMBER,

            to:
                whatsappTo,

            body:
                `Hi ${
                    bill.customer_name ||
                    "there"
                }! 👋

Thank you for choosing ${profileData?.business_name || "us"}.

🧾 Your Bill

Total Service Amount:
₹${grossTotal.toLocaleString("en-IN")}

Advance Paid:
-₹${advancePaid.toLocaleString("en-IN")}

Balance Due:
₹${balanceDue.toLocaleString("en-IN")}

Payment Method:
${bill.payment_method || "UPI"}

Your e-bill is attached.

Thank you for choosing ${profileData?.business_name || "us"}! 😊`,

            mediaUrl: [
                pdfUrl
            ]

        });


            console.log(
                "BILL SENT:",
                twilioMessage.sid
            );


            return res.status(200).json({

                success:
                    true,

                message:
                    "Bill sent successfully.",

                sid:
                    twilioMessage.sid,

                status:
                    twilioMessage.status,

                pdfUrl:
                    pdfUrl

            });

        }

        catch (error) {

            console.error(
                "SEND BILL ERROR:",
                error
            );


            return res.status(500).json({

                error:
                    "Failed to send bill."

            });

        }

    }
);


// =====================================================
// SEND BILL ON SMS
// =====================================================

app.post(
    "/send-bill-sms",
    async (req, res) => {
        try {
            const { billId } = req.body;
            if (!billId) {
                return res.status(400).json({ error: "Bill ID is required." });
            }

            const { data: bill, error: billError } = await supabase
                .from("bills")
                .select("*")
                .eq("id", billId)
                .single();

            if (billError || !bill) {
                return res.status(404).json({ error: "Bill not found." });
            }

            const { data: items, error: itemsError } = await supabase
                .from("bill_items")
                .select("*")
                .eq("bill_id", billId)
                .order("created_at", { ascending: true });

            if (itemsError) {
                return res.status(500).json({ error: "Unable to load bill items." });
            }

            console.log("Generating bill PDF for SMS...");
            const pdfBuffer = await generateBillPDF(bill, items);
            const fileName = `bill-${bill.id}.pdf`;

            await supabase.storage
                .from("bills")
                .upload(fileName, pdfBuffer, {
                    contentType: "application/pdf",
                    upsert: true
                });

            const { data: publicUrlData } = supabase.storage
                .from("bills")
                .getPublicUrl(fileName);

            const pdfUrl = publicUrlData.publicUrl;

            let phone = String(bill.phone || "").trim();
            if (!phone) {
                return res.status(400).json({ error: "Customer phone number is missing." });
            }

            if (phone.startsWith("whatsapp:")) {
                phone = phone.replace("whatsapp:", "").trim();
            }

            if (phone.startsWith("+91")) {
                // Formatted
            } else if (phone.startsWith("91") && phone.length === 12) {
                phone = `+${phone}`;
            } else if (phone.length === 10) {
                phone = `+91${phone}`;
            }

            const grossTotal = Number(bill.total || 0);
            const smsFrom =
                process.env.TWILIO_PHONE_NUMBER ||
                process.env.TWILIO_NUMBER ||
                (process.env.TWILIO_MESSAGING_SERVICE_SID ? undefined : null);

            if (!smsFrom && !process.env.TWILIO_MESSAGING_SERVICE_SID) {
                return res.status(400).json({
                    error: "Twilio SMS number is missing. Please add TWILIO_PHONE_NUMBER=+1... to backend/.env"
                });
            }

            const sendPayload = {
                to: phone,
                body: `Dear ${bill.customer_name || "Customer"}, thank you for visiting! Your invoice total is Rs. ${grossTotal.toLocaleString("en-IN")}. View & download your bill here: ${pdfUrl}`
            };

            if (process.env.TWILIO_MESSAGING_SERVICE_SID) {
                sendPayload.messagingServiceSid = process.env.TWILIO_MESSAGING_SERVICE_SID;
            } else {
                sendPayload.from = smsFrom;
            }

            const twilioMessage = await twilioClient.messages.create(sendPayload);

            console.log("BILL SMS SENT:", twilioMessage.sid);

            return res.status(200).json({
                success: true,
                message: "Bill SMS sent successfully.",
                sid: twilioMessage.sid,
                pdfUrl: pdfUrl
            });
        } catch (error) {
            console.error("SEND BILL SMS ERROR:", error);
            return res.status(500).json({
                error: error.message || "Failed to send bill via SMS."
            });
        }
    }
);


// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
    "/",
    (req, res) => {

        res.json({

            status:
                "online",

            service:
                "Bella Salon WhatsApp AI Receptionist",

            model:
                AI_MODEL

        });

    }
);

// =====================================================
// MARK BOOKING ADVANCE AS PAID
// =====================================================


// =====================================================
// GENERATE MENU PDF FROM SERVICES DATABASE
// =====================================================

async function generateMenuPDF() {

    const services =
        await getServicesFromDatabase();

    return new Promise(
        (resolve, reject) => {

            try {

                const doc =
                    new PDFDocument({
                        size: "A4",
                        margin: 45
                    });

                const chunks = [];

                doc.on(
                    "data",
                    chunk => {
                        chunks.push(chunk);
                    }
                );

                doc.on(
                    "end",
                    () => {
                        resolve(
                            Buffer.concat(chunks)
                        );
                    }
                );

                doc.on(
                    "error",
                    reject
                );


                // =====================================
                // HEADER
                // =====================================

                doc
                    .fontSize(26)
                    .font("Helvetica-Bold")
                    .fillColor("#111111")
                    .text(
                        BUSINESS.name,
                        {
                            align: "center"
                        }
                    );

                doc
                    .moveDown(0.3)
                    .fontSize(12)
                    .font("Helvetica")
                    .fillColor("#777777")
                    .text(
                        "SALON & SPA Ã¢â‚¬Â¢ SERVICE MENU",
                        {
                            align: "center"
                        }
                    );

                doc
                    .moveDown(0.5)
                    .fontSize(9)
                    .text(
                        BUSINESS.address,
                        {
                            align: "center"
                        }
                    );

                doc.text(
                    `${BUSINESS.phone} Ã¢â‚¬Â¢ ${BUSINESS.hours}`,
                    {
                        align: "center"
                    }
                );

                doc.moveDown(2);


                // =====================================
                // SERVICES GROUPED BY CATEGORY
                // =====================================

                if (!services.length) {

                    doc
                        .fontSize(14)
                        .font("Helvetica")
                        .fillColor("#555555")
                        .text(
                            "No services are currently available.",
                            {
                                align: "center"
                            }
                        );

                } else {

                    // Group services by category
                    const grouped = {};
                    services.forEach(service => {
                        const cat = (service.category || "General Services").toUpperCase();
                        if (!grouped[cat]) grouped[cat] = [];
                        grouped[cat].push(service);
                    });

                    Object.entries(grouped).forEach(([categoryName, catServices]) => {
                        // Category Header
                        doc
                            .fontSize(13)
                            .font("Helvetica-Bold")
                            .fillColor("#e98272")
                            .text(categoryName);

                        doc
                            .strokeColor("#e2e8f0")
                            .lineWidth(0.5)
                            .moveTo(45, doc.y + 2)
                            .lineTo(550, doc.y + 2)
                            .stroke();

                        doc.moveDown(0.4);

                        catServices.forEach(service => {
                            const price = Number(service.price) || 0;
                            const durationText = service.duration ? ` (${service.duration})` : "";
                            const itemY = doc.y;

                            doc
                                .fontSize(10)
                                .font("Helvetica-Bold")
                                .fillColor("#1e293b")
                                .text(service.name + durationText, 45, itemY, { width: 380 });

                            doc
                                .font("Helvetica")
                                .fillColor("#0f172a")
                                .text(`â‚¹${price.toLocaleString("en-IN")}`, 430, itemY, { width: 120, align: "right" });

                            doc.moveDown(0.3);
                        });

                        doc.moveDown(0.8);
                    });

                }


                // =====================================
                // FOOTER
                // =====================================

                doc
                    .moveDown(2)
                    .fontSize(9)
                    .font("Helvetica")
                    .fillColor("#777777")
                    .text(
                        "Prices are based on the current services listed by ZARAH ELITE.",
                        {
                            align: "center"
                        }
                    );


                doc.end();

            } catch (error) {

                reject(error);

            }

        }
    );
}
// =====================================================
// MENU PDF
// =====================================================

app.get("/menu.pdf", (req, res) => {

    const menuPath = path.join(
        __dirname,
        "menu",
        "Zarah_Elite_Menu.pdf"
    );

    res.sendFile(
        menuPath,
        error => {

            if (error) {

                console.error(
                    "MENU PDF ERROR:",
                    error
                );

                if (!res.headersSent) {
                    res
                        .status(500)
                        .send(
                            "Unable to send menu."
                        );
                }
            }

        }
    );
});
// =====================================================
// SERVER
// =====================================================

app.listen(
    PORT,
    async () => {

        console.log(
            "================================="
        );

        console.log(
            "Ã°Å¸Å¡â‚¬ Bella Salon Server"
        );

        console.log(
            `Ã°Å¸Å¡â‚¬ Running on port ${PORT}`
        );

        console.log(
            `Ã°Å¸â€™Â³ UPI: ${UPI_ID}`
        );

        console.log(
            `Ã°Å¸â€™Â° Advance: Ã¢â€šÂ¹${ADVANCE_AMOUNT}`
        );

        console.log(
            `Ã°Å¸Â¤â€“ AI Model: ${AI_MODEL}`
        );

        console.log(
            "================================="
        );


        try {

            await twilioClient
                .api
                .accounts(
                    process.env.TWILIO_ACCOUNT_SID
                )
                .fetch();


            console.log(
                "Ã¢Å“â€¦ Twilio Connected"
            );

        }

        catch (error) {

            console.log(
                "Ã¢ÂÅ’ Twilio Connection Failed"
            );

            console.log(
                error.message
            );

        }

    }
);