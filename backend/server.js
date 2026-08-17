require("dotenv").config();

// =====================================================
// IMPORTS
// =====================================================
const path = require("path");
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
        "https://kangro.in"
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
}));
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
                    "❌ Razorpay webhook signature missing"
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
                    "❌ Invalid Razorpay webhook signature"
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
                    "❌ Payment link data missing"
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
                    "❌ No booking reference found"
                );

                return res
                    .status(400)
                    .send("Booking reference missing");

            }


            // ==========================================
            // ONLY ACCEPT ₹500 ADVANCE
            // ==========================================

            if (
                amountPaid <
                ADVANCE_AMOUNT
            ) {

                console.error(
                    "❌ Incorrect payment amount:",
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
                    "❌ Booking not found:",
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
                    "⚠️ Advance already marked as paid."
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
                    "❌ Booking update failed:",
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
                "✅ ADVANCE PAYMENT CONFIRMED"
            );

            console.log(
                "Booking:",
                updatedBooking.id
            );

            console.log(
                "Advance:",
                `₹${ADVANCE_AMOUNT}`
            );

            console.log(
                "Balance:",
                `₹${updatedBooking.balance_amount}`
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

// Perfect! Your appointment is confirmed. 😊

// ✨ ${BUSINESS.name}

// Service: ${updatedBooking.service}

// Date: ${formatDateForCustomer(
//     updatedBooking.booking_date
// )}

// Time: ${formatTimeForCustomer(
//     updatedBooking.booking_time
// )}

// 💳 Advance paid: ₹${ADVANCE_AMOUNT}

// 💰 Balance remaining: ₹${updatedBooking.balance_amount}

// 📍 ${BUSINESS.address}

// We look forward to seeing you! 😊
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
//                     "✅ WhatsApp confirmation sent:",
//                     message.sid
//                 );

//             }

//             catch (whatsappError) {

//                 console.error(
//                     "⚠️ Payment confirmed but WhatsApp failed:",
//                     whatsappError
//                 );

//             }

// ==========================================
// SEND PAYMENT CONFIRMATION
// ==========================================

const confirmationMessage = `
Perfect! Your appointment is confirmed. 😊

✨ ${BUSINESS.name}

Service: ${updatedBooking.service}
Date: ${formatDateForCustomer(
    updatedBooking.booking_date
)}
Time: ${formatTimeForCustomer(
    updatedBooking.booking_time
)}

💳 Advance paid: ₹${ADVANCE_AMOUNT}
💰 Balance remaining: ₹${updatedBooking.balance_amount}

📍 ${BUSINESS.address}

We look forward to seeing you! 😊
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
        "📸 Sending Instagram payment confirmation to:",
        updatedBooking.instagram_user_id
    );

    await sendInstagramMessage(
    updatedBooking.instagram_user_id,
    confirmationMessage,
    updatedBooking.profile_id
);

    console.log(
        "✅ Instagram confirmation sent"
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
            "✅ WhatsApp confirmation sent:",
            message.sid
        );
    }

}

catch (notificationError) {

    console.error(
        "⚠️ Payment confirmed but confirmation message failed:",
        notificationError
    );

}


            return res
                .status(200)
                .send("Payment processed");

        }

        catch (error) {

            console.error(
                "\n❌ RAZORPAY WEBHOOK ERROR:"
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

app.use(express.urlencoded({ extended: false }));
app.use(express.json());


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
async function getServicesFromDatabase() {

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
            gst_rate
        `)
        .eq(
            "profile_id",
            PROFILE_ID
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
// CUSTOMER DATABASE HELPER
// =====================================================

async function findOrCreateCustomer({
    profileId,
    name,
    phone
}) {

    if (!profileId || !phone) {
        console.log(
            "⚠️ Customer not created: missing profileId or phone"
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
            "👤 Existing customer found:",
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

            profile_id: profileId,

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
        "👤 New customer created:",
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
    profileName
) {

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

You are the booking-intelligence layer
for ${BUSINESS.name}.

You are NOT speaking to the customer.

Your job is to understand the customer's
message using the current message AND
the previous conversation.

Return ONLY valid JSON.

Schema:

{
    "intent": "",
    "customer_name": "",
    "phone": "",
    "service": "",
    "booking_date": "",
    "booking_time": "",
    "question": "",
    "payment_confirmation": false
}

Possible intents:

greeting
booking
cancel
reschedule
pricing
services
hours
location
faq
payment_confirmation
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
"₹500 paid"
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
        "❌ AI RESPONSE DID NOT CONTAIN CHOICES:"
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


console.log("🔍 INSTAGRAM HUMAN REPLY RAW AI RESPONSE:");
console.log(JSON.stringify(completion, null, 2));

let content =
    completion?.choices?.[0]?.message?.content;

console.log("🔍 INSTAGRAM HUMAN REPLY CONTENT:");
console.log(content);

if (!content) {
    console.error(
        "❌ INSTAGRAM HUMAN REPLY CONTENT IS EMPTY"
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
    phone
}) {

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

CURRENT BOOKING CONTEXT:
Service: ${booking?.service || ""}
Date: ${booking?.booking_date || ""}
Time: ${booking?.booking_time || ""}

WHAT THE BUSINESS SYSTEM ACTUALLY DID:
${systemResult}

PREVIOUS CONVERSATION:
${historyText}

BUSINESS INFORMATION:
Name: ${BUSINESS.name}
Address: ${BUSINESS.address}
Phone: ${BUSINESS.phone}
Opening hours: ${BUSINESS.hours}

SERVICE INFORMATION:
Use the information provided in
"WHAT THE BUSINESS SYSTEM ACTUALLY DID".

Do not invent service names or prices.
If a specific service or price is not provided
by the business system, do not guess.
`;

    const completion =
        await client.chat.completions.create({

            model: AI_MODEL,

            temperature: 0.75,

            messages: [

                {
                    role: "system",

                    content: `
You are the receptionist of ${BUSINESS.name}.

You communicate with customers through WhatsApp.

Your job is to make the conversation feel like it is
happening with a genuinely good human receptionist.

You are NOT a chatbot.

==================================================
CONVERSATION STYLE
==================================================

Be natural, relaxed, attentive and professional.

Write like a real WhatsApp receptionist.

Keep messages short and easy to read.

Usually use 1-4 sentences.

Do not over-explain.

Do not dump information unless the customer asks for it.

Do not sound robotic.

Do not sound like a customer-support form.

Do not repeatedly say:
"How can I help you?"

Use natural variations.

Examples:

Customer:
"hi"

Good:
"Hey! 😊 Welcome to ${BUSINESS.name}. What can I help you with?"

Customer:
"hello"

Good:
"Hi! 😊 What are you looking to get done today?"

Customer:
"thanks"

Good:
"You're very welcome! 😊"

Customer:
"ok"

Good:
"Sure 😊 Just let me know whenever you're ready."

==================================================
CONVERSATION MEMORY
==================================================

Pay close attention to previous messages.

Remember information the customer has already provided.

NEVER make the customer repeat information unnecessarily.

Example:

Customer:
"I want a haircut tomorrow."

Receptionist:
"Sure! What time would you prefer?"

Customer:
"5"

Understand that they mean:
Haircut + tomorrow + 5 PM.

Do NOT ask:
"Which service?"

Do NOT ask:
"Which date?"

Continue naturally.

Another example:

Customer:
"How much is facial?"

Receptionist:
"Facial is ₹900."

Customer:
"Can I book tomorrow?"

Understand that "it" / the booking refers to the facial.

Do not ask which service unless genuinely unclear.

==================================================
BOOKING
==================================================

The booking/system logic is responsible for actually
creating or confirming appointments.

You must NEVER claim that a booking was created,
confirmed, cancelled or rescheduled unless
SYSTEM RESULT explicitly says that it happened.

If SYSTEM RESULT says information is missing,
ask naturally ONLY for the missing information.

Example:

SYSTEM RESULT:
Missing information: time

Good:
"Sure. What time would you prefer?"

Bad:
"Please provide the required booking fields."

If service and date are already known, never ask for them again.

==================================================
PAYMENTS
==================================================

SYSTEM RESULT is the ONLY source of truth for payment.

Never assume that a customer has paid.

Never say payment was received unless SYSTEM RESULT
explicitly confirms it.

If payment is confirmed, clearly tell the customer
that the appointment is confirmed.

Do not ask them to pay again.

If no pending booking was found, do NOT claim payment
was received.

==================================================
PRICES
==================================================

Use ONLY the prices provided in BUSINESS INFORMATION.

Never invent a price.

If a service price is not available, say that you don't
have the price information rather than guessing.

==================================================
SERVICES
==================================================

Use ONLY the services provided in BUSINESS INFORMATION.

Never invent services.

==================================================
AVAILABILITY
==================================================

NEVER invent appointment availability.

Only say that a time is available if the SYSTEM RESULT
explicitly says so.

==================================================
GENERAL QUESTIONS
==================================================

For questions about:

- services
- pricing
- opening hours
- location
- bookings
- payments

use the information provided.

If you don't have enough information, be honest.

Do not invent policies, discounts, staff information,
availability or business details.

==================================================
HUMAN BEHAVIOUR
==================================================

Understand casual WhatsApp language.

Examples:

"tmrw" = tomorrow
"5" = 5 PM if the conversation is asking for a time
"ya" = yes
"yep" = yes
"ok" = acknowledgement
"cool" = acknowledgement
"thanks" = appreciation
"done" = acknowledgement/payment context depending on conversation

Use context rather than treating every message independently.

If the customer changes their mind, follow the latest request.

If they ask a simple question, give a simple answer.

If they are just chatting, respond naturally.

==================================================
IMPORTANT
==================================================

NEVER mention:

AI
artificial intelligence
bot
chatbot
JSON
database
backend
API
system processing
intent
automation
model
internal processing

Never say:

"According to our system."

"Your request has been processed."

"Intent detected."

"Please provide the required fields."

Instead, talk like a real receptionist.

==================================================
CRITICAL SAFETY
==================================================

Never invent:

- availability
- prices
- services
- payment confirmation
- booking confirmation
- cancellation confirmation
- staff information
- policies
- discounts

Never contradict SYSTEM RESULT.

SYSTEM RESULT is the source of truth.

==================================================
FINAL RESPONSE
==================================================

Return ONLY the WhatsApp message.

No analysis.

No JSON.

No explanation.

No quotation marks around the response.
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

    const {
        data: profile,
        error
    } = await supabase
        .from("profiles")
        .select("instagram_access_token")
        .eq("id", profileId)
        .single();

    if (
        error ||
        !profile?.instagram_access_token
    ) {
        console.error(
            "❌ Instagram token not found:",
            error
        );

        throw new Error(
            "Instagram account is not connected."
        );
    }

    const response =
        await fetch(
            "https://graph.instagram.com/v23.0/me/messages",
            {
                method: "POST",

                headers: {
                    "Content-Type":
                        "application/json",

                    "Authorization":
                        `Bearer ${profile.instagram_access_token}`
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
            "❌ Instagram send message failed:",
            data
        );

        throw new Error(
            JSON.stringify(data)
        );
    }

    console.log(
        "✅ Instagram reply sent:",
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

                return res.sendStatus(200);

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
                    profileName
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
₹${ADVANCE_AMOUNT}

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
₹${await getServicePrice(
                        confirmed.service
                    )}

Advance paid:
₹${ADVANCE_AMOUNT}

Remaining balance:
₹${confirmed.balance_amount}

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
₹${ADVANCE_AMOUNT}

Razorpay payment link:
${paymentLink.short_url}

Ask the customer naturally to complete
the ₹500 advance using the payment link.

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

The customer must pay a ₹500 advance.

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
₹${servicePrice}

Advance:
₹${ADVANCE_AMOUNT}

Razorpay payment link:
${paymentLink.short_url}

Remaining balance after advance:
₹${Math.max(
    servicePrice -
    ADVANCE_AMOUNT,
    0
)}

Tell the customer naturally that the
slot is reserved pending the ₹500 advance.

Tell them to complete the ₹500 payment
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
₹${Number(service.price).toLocaleString("en-IN")}

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
            // HOURS
            // =================================================

            else if (
    booking.intent === "hours"
) {

    systemResult = `
The business is open during these hours:

${BUSINESS.hours}

Answer naturally.
`;
}


            // =================================================
            // LOCATION
            // =================================================

            else if (
    booking.intent === "location"
) {

    systemResult = `
The business is located at:

${BUSINESS.address}

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
                        phone

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
//                         "SALON & SPA • SERVICE MENU",
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
//                         `${BUSINESS.phone} • ${BUSINESS.hours}`,
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
//                                         `    ₹${price.toLocaleString("en-IN")}`,
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
            "Sure! 😊 I've shared our service menu. Have a look and let me know what you'd like to book."

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
        "✅ Fixed ZARAH ELITE menu PDF sent."
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


            return res.status(200).end();

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
                            "Sorry, I ran into a small issue. Could you try that again? 😊"

                    });

                }

            }

            catch (twilioError) {

                console.error(
                    "TWILIO FALLBACK ERROR:",
                    twilioError
                );

            }


            return res.sendStatus(200);

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

                            <h2>Booking Confirmed ✓</h2>

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
                                ₹500
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
                            Pay ₹500 via UPI
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

        console.log("✅ Instagram webhook verified");

        return res
            .status(200)
            .send(challenge);
    }

    console.error("❌ Instagram webhook verification failed");

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
//         console.log("📩 NEW INSTAGRAM WEBHOOK");
//         console.log(JSON.stringify(req.body, null, 2));
//         console.log("================================");

//         const entries = req.body?.entry || [];

//         for (const entry of entries) {

//             const messaging = entry?.messaging || [];

//             for (const event of messaging) {

//     console.log(
//         "🔎 Instagram event keys:",
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
//             "ℹ️ Ignoring non-message Instagram event"
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
//             "⚠️ Instagram message missing sender/text:"
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
//         "📨 Instagram sender:",
//         senderId
//     );

//     console.log(
//         "💬 Instagram message:",
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
//                     "🤖 INSTAGRAM AI UNDERSTANDING:"
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
//                     "🤖 Instagram AI reply:",
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
//                     "✅ Instagram reply completed"
//                 );
//             }
//         }

//     }
//     catch (error) {

//         console.error(
//             "\n❌ INSTAGRAM WEBHOOK ERROR:"
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
                "❌ Instagram OAuth error:",
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
            "📸 Instagram token response:",
            tokenData
        );

        if (
            !tokenResponse.ok ||
            !tokenData.access_token
        ) {
            console.error(
                "❌ Instagram token exchange failed:",
                tokenData
            );

            return res.status(400).send(`
                <h2>Instagram connection failed</h2>
                <p>Could not obtain an Instagram access token.</p>
            `);
        }

        const accessToken =
    tokenData.access_token;

// Get the actual Instagram account ID used by webhooks
const meResponse = await fetch(
    `https://graph.instagram.com/v23.0/me?fields=user_id,username&access_token=${accessToken}`
);

const meData = await meResponse.json();

console.log("📸 Instagram /me:", meData);

if (!meResponse.ok || !meData.user_id) {
    console.error("❌ Could not get Instagram account ID:", meData);

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
                    true
            })
            .eq(
                "id",
                profileId
            );

        if (saveError) {

            console.error(
                "❌ Instagram connection save failed:",
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
            "✅ INSTAGRAM CONNECTED"
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

                <h2>✅ Instagram connected successfully</h2>

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
            "❌ Instagram callback error:",
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
        console.log("📩 NEW INSTAGRAM WEBHOOK");
        console.log(JSON.stringify(req.body, null, 2));
        console.log("================================");

        const entries = req.body?.entry || [];

        for (const entry of entries) {
            const instagramBusinessId =
    entry?.id;

const {
    data: instagramProfile,
    error: instagramProfileError
} = await supabase
    .from("profiles")
    .select("id")
    .eq(
        "instagram_user_id",
        instagramBusinessId
    )
    .single();

if (
    instagramProfileError ||
    !instagramProfile
) {
    console.error(
        "❌ No Kangro profile found for Instagram account:",
        instagramBusinessId
    );

    continue;
}

const activeInstagramProfileId =
    instagramProfile.id;

            const messaging = entry?.messaging || [];

            for (const event of messaging) {

                console.log(
                    "🔎 Instagram event keys:",
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
                        "ℹ️ Ignoring non-customer Instagram event"
                    );

                    continue;
                }

                // -----------------------------------------
                // GET CUSTOMER MESSAGE
                // -----------------------------------------

                const senderId =
                    event.sender?.id;

                const message =
                    event.message?.text?.trim();

                if (!senderId || !message) {

                    console.log(
                        "⚠️ Instagram message missing sender/text"
                    );

                    continue;
                }

                console.log(
                    "📨 Instagram sender:",
                    senderId
                );

                console.log(
                    "💬 Instagram message:",
                    message
                );

                // -----------------------------------------
                // INSTAGRAM CUSTOMER ID
                // -----------------------------------------

                const instagramPhone =
                    `instagram:${senderId}`;

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
                        ""
                    );

                console.log(
                    "🤖 INSTAGRAM AI UNDERSTANDING:"
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

if (!booking.customer_name) {
    missing.push("name");
}

if (!booking.phone || booking.phone === instagramPhone) {
    missing.push("phone");
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
                    // COMPLETE BOOKING
                    // -----------------------------------------

                    else {

                        console.log(
                            "📅 Complete Instagram booking details received"
                        );

                        const service =
    booking.service;

const servicePrice =
    await getServicePrice(service);

                        const profileName =
                            booking.customer_name ||
                            "Instagram Customer";

                        // -----------------------------------------
                        // CHECK EXISTING PENDING BOOKING
                        // -----------------------------------------

                        const existingPending =
                            await findPendingBooking(
                                instagramPhone
                            );

                        if (
                            existingPending &&
                            existingPending.booking_date ===
                                booking.booking_date &&
                            existingPending.booking_time ===
                                booking.booking_time &&
                            existingPending.service ===
                                booking.service
                        ) {

                            console.log(
                                "⚠️ Existing pending Instagram booking found:",
                                existingPending.id
                            );

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
₹${ADVANCE_AMOUNT}

Razorpay payment link:
${paymentLink.short_url}

Ask the customer naturally to complete the ₹${ADVANCE_AMOUNT} advance using the payment link.

Do NOT say the appointment is confirmed.
`;

                        }

                        // -----------------------------------------
                        // CREATE NEW BOOKING
                        // -----------------------------------------

                        else {

                            console.log(
                                "📝 Creating Instagram pending booking..."
                            );

                            const {
                                data: createdBooking,
                                error
                            } = await supabase

                                .from("bookings")

                                .insert({

                                    profile_id:
                                        PROFILE_ID,

                                    customer_name:
    booking.customer_name || "Instagram Customer",

phone:
    booking.phone || null,

instagram_user_id:
    senderId,

service:
    service,

booking_date:
    booking.booking_date,

booking_time:
    booking.booking_time,

status:
    "Pending",

source:
    "Instagram",

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
        servicePrice - ADVANCE_AMOUNT,
        0
    )

                                })

                                .select()
                                .single();


                            // -----------------------------------------
                            // DATABASE ERROR
                            // -----------------------------------------

                            if (error) {

                                console.error(
                                    "❌ INSTAGRAM BOOKING INSERT ERROR:",
                                    error
                                );

                                systemResult = `
The booking could not be created because of a temporary error.

Do not say the appointment was booked.

Apologize naturally and ask the customer to try again.
`;

                            }

                            // -----------------------------------------
                            // BOOKING CREATED
                            // -----------------------------------------

                            else {

                                console.log(
                                    "✅ INSTAGRAM PENDING BOOKING CREATED:",
                                    createdBooking.id
                                );

                                await findOrCreateCustomer({
    profileId: PROFILE_ID,
    name:
        booking.customer_name ||
        "Instagram Customer",
    phone: booking.phone
});

                                // -----------------------------------------
                                // CREATE RAZORPAY PAYMENT LINK
                                // -----------------------------------------

                                const paymentLink =
                                    await createRazorpayPaymentLink(
                                        createdBooking,
                                        profileName
                                    );

                                console.log(
                                    "💳 INSTAGRAM RAZORPAY LINK:",
                                    paymentLink.short_url
                                );

                                // -----------------------------------------
                                // SEND PAYMENT INFO TO AI
                                // -----------------------------------------

                                systemResult = `
A booking has been successfully created but it is NOT confirmed yet.

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
₹${servicePrice}

Advance:
₹${ADVANCE_AMOUNT}

Razorpay payment link:
${paymentLink.short_url}

Remaining balance after advance:
₹${Math.max(
    servicePrice - ADVANCE_AMOUNT,
    0
)}

Tell the customer naturally that their slot is reserved pending the ₹${ADVANCE_AMOUNT} advance.

Tell them to complete the payment using the Razorpay payment link.

Do NOT ask them to reply PAID.

Do NOT say the appointment is confirmed.
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

    systemResult = `
The customer is asking for the salon's service menu.

The complete current service menu is available here:

https://saloon-zarah.onrender.com/menu.pdf

Tell the customer naturally that they can view the complete service menu using this link.

Send the URL exactly as provided.

Do NOT list individual services or prices in the message.
Do NOT invent any services or prices.
`;
}

                else {

                    systemResult = `
The customer contacted the salon through Instagram.

Customer message:
${message}

Intent:
${booking?.intent || ""}

Service:
${booking?.service || ""}

Date:
${booking?.booking_date || ""}

Time:
${booking?.booking_time || ""}

Respond naturally and helpfully.

Do not invent:
- services
- prices
- availability
- bookings
- payments
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
                            instagramPhone
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
            "\n❌ INSTAGRAM WEBHOOK ERROR:"
        );

        console.error(error);
    }

});



// =====================================================
// GENERATE BILL PDF
// =====================================================

async function generateBillPDF(
    bill,
    items
) {

    return new Promise(
        (resolve, reject) => {

            try {

                const doc =
                    new PDFDocument({
                        size: "A4",
                        margin: 50
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


                // ==========================================
                // HEADER
                // ==========================================

                doc
                    .fontSize(22)
                    .font("Helvetica-Bold")
                    .fillColor("#000000")
                    .text(
                        BUSINESS.name
                    );


                doc
                    .fontSize(10)
                    .font("Helvetica")
                    .fillColor("#666666")
                    .text(
                        "AI Receptionist"
                    );


                doc
                    .text(
                        BUSINESS.address
                    );


                doc.moveDown(2);


                // ==========================================
                // INVOICE
                // ==========================================

                doc
                    .fillColor("#000000")
                    .fontSize(24)
                    .font("Helvetica-Bold")
                    .text(
                        "INVOICE"
                    );


                const billNumber =
                    String(bill.id)
                        .substring(0, 8)
                        .toUpperCase();


                doc
                    .fontSize(10)
                    .font("Helvetica")
                    .fillColor("#666666")
                    .text(
                        `Bill #${billNumber}`
                    );


                doc.text(
                    `Date: ${
                        new Date(
                            bill.created_at
                        ).toLocaleString("en-IN")
                    }`
                );


                // ==========================================
                // CUSTOMER
                // ==========================================

                doc.moveDown(1.5);


                doc
                    .fillColor("#000000")
                    .fontSize(11)
                    .font("Helvetica-Bold")
                    .text(
                        "BILLED TO"
                    );


                doc
                    .fontSize(11)
                    .font("Helvetica")
                    .text(
                        bill.customer_name || "-"
                    );


                doc
                    .fillColor("#666666")
                    .text(
                        bill.phone || "-"
                    );


                // ==========================================
                // DIVIDER
                // ==========================================

                doc.moveDown(1);


                doc
                    .strokeColor("#dddddd")
                    .moveTo(
                        50,
                        doc.y
                    )
                    .lineTo(
                        545,
                        doc.y
                    )
                    .stroke();


                // ==========================================
                // ITEMS
                // ==========================================

                doc.moveDown(1);


                doc
                    .fillColor("#666666")
                    .fontSize(10)
                    .font("Helvetica-Bold")
                    .text(
                        "DESCRIPTION",
                        50
                    );


                doc.text(
                    "AMOUNT",
                    450,
                    doc.y
                );


                doc.moveDown(.8);


                (items || []).forEach(
                    item => {

                        const itemY =
                            doc.y;


                        doc
                            .fillColor("#000000")
                            .fontSize(11)
                            .font("Helvetica")
                            .text(
                                item.item_name,
                                50,
                                itemY
                            );


                        doc.text(
                            `₹${Number(
                                item.total
                            ).toLocaleString("en-IN")}`,
                            450,
                            itemY,
                            {
                                width:95,
                                align:"right"
                            }
                        );


                        doc.moveDown(.7);


                        doc
                            .strokeColor("#eeeeee")
                            .moveTo(
                                50,
                                doc.y
                            )
                            .lineTo(
                                545,
                                doc.y
                            )
                            .stroke();


                        doc.moveDown(.7);

                    }
                );


                // ==========================================
                // SUMMARY
                // ==========================================

                doc.moveDown(1);


                function summaryRow(
                    label,
                    value,
                    bold = false
                ) {

                    const y =
                        doc.y;


                    doc
                        .fontSize(
                            bold ? 14 : 11
                        )
                        .font(
                            bold
                                ? "Helvetica-Bold"
                                : "Helvetica"
                        )
                        .fillColor("#000000")
                        .text(
                            label,
                            300,
                            y
                        );


                    doc.text(
                        value,
                        450,
                        y,
                        {
                            width:95,
                            align:"right"
                        }
                    );


                    doc.moveDown(
                        bold ? .8 : .5
                    );

                }


                summaryRow(
                    "Subtotal",
                    `₹${Number(
                        bill.subtotal || 0
                    ).toLocaleString("en-IN")}`
                );


                summaryRow(
                    "Add-ons",
                    `₹${Number(
                        bill.addon_total || 0
                    ).toLocaleString("en-IN")}`
                );


                summaryRow(
                    "Discount",
                    `-₹${Number(
                        bill.discount || 0
                    ).toLocaleString("en-IN")}`
                );


                // IMPORTANT:
                // Advance is deducted from final bill

                const grossTotal =
    Number(bill.total || 0);

const advancePaid =
    Number(bill.advance_paid || 0);

const balanceDue =
    Math.max(
        grossTotal - advancePaid,
        0
    );


                summaryRow(
                    "Advance Paid",
                    `-₹${advancePaid.toLocaleString("en-IN")}`
                );


                doc
                    .strokeColor("#dddddd")
                    .moveTo(
                        300,
                        doc.y
                    )
                    .lineTo(
                        545,
                        doc.y
                    )
                    .stroke();


                doc.moveDown(.8);


                summaryRow(
    "BALANCE DUE",
    `₹${balanceDue.toLocaleString("en-IN")}`,
    true
);


                // ==========================================
                // PAYMENT
                // ==========================================

                doc.moveDown(1.5);


                doc
                    .fontSize(11)
                    .font("Helvetica-Bold")
                    .fillColor("#000000")
                    .text(
                        `Payment Method: ${
                            bill.payment_method ||
                            "UPI"
                        }`
                    );


                doc
                    .fontSize(11)
                    .font("Helvetica")
                    .fillColor("#24945a")
                    .text(
                        "Payment Status: PAID"
                    );


                // ==========================================
                // FOOTER
                // ==========================================

                doc.moveDown(3);


                doc
                    .fontSize(11)
                    .fillColor("#666666")
                    .text(
                        `Thank you for visiting ${BUSINESS.name}.`,
                        {
                            align:"center"
                        }
                    );


                doc
                    .fontSize(9)
                    .text(
                        "We look forward to seeing you again.",
                        {
                            align:"center"
                        }
                    );


                doc.end();

            }

            catch (error) {

                reject(error);

            }

        }
    );

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


            // GENERATE PDF
            const pdfBuffer =
                await generateBillPDF(
                    bill,
                    items || []
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
            // GENERATE PDF
            // ==========================================

            console.log(
                "Generating bill PDF..."
            );


            const pdfBuffer =
                await generateBillPDF(
                    bill,
                    items
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

console.log("📱 Sending bill to:", whatsappTo);


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

Thank you for visiting Bella Salon.

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

Thank you for choosing Bella Salon! 😊`,

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
                        "SALON & SPA • SERVICE MENU",
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
                    `${BUSINESS.phone} • ${BUSINESS.hours}`,
                    {
                        align: "center"
                    }
                );

                doc.moveDown(2);


                // =====================================
                // SERVICES
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

                    services.forEach(
                        service => {

                            const price =
                                Number(
                                    service.price
                                ) || 0;


                            doc
                                .fontSize(12)
                                .font(
                                    "Helvetica-Bold"
                                )
                                .fillColor("#111111")
                                .text(
                                    service.name,
                                    {
                                        continued: true
                                    }
                                );


                            doc
                                .font(
                                    "Helvetica"
                                )
                                .text(
                                    `    ₹${price.toLocaleString("en-IN")}`
                                );


                            doc
                                .moveDown(0.5);
                        }
                    );

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
            "🚀 Bella Salon Server"
        );

        console.log(
            `🚀 Running on port ${PORT}`
        );

        console.log(
            `💳 UPI: ${UPI_ID}`
        );

        console.log(
            `💰 Advance: ₹${ADVANCE_AMOUNT}`
        );

        console.log(
            `🤖 AI Model: ${AI_MODEL}`
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
                "✅ Twilio Connected"
            );

        }

        catch (error) {

            console.log(
                "❌ Twilio Connection Failed"
            );

            console.log(
                error.message
            );

        }

    }
);