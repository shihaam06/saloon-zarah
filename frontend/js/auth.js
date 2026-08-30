// =====================================================
// REGISTER
// =====================================================

const registerBtn =
    document.getElementById("registerBtn");

if (registerBtn) {

    registerBtn.addEventListener("click", async () => {

        const businessName =
            document.getElementById("businessName").value.trim();

        const email =
            document.getElementById("email").value.trim();

        const password =
            document.getElementById("password").value;

        const ownerPin =
            document.getElementById("ownerPin") ? document.getElementById("ownerPin").value : null;

        const product =
            document.getElementById("selectedProduct") ? document.getElementById("selectedProduct").value : "SAL";

        if (!businessName || !email || !password) {
            alert("Please fill in all required fields (Business Name, Email, Password).");
            return;
        }

        const { data, error } =
            await client.auth.signUp({
                email,
                password
            });


        if (error) {

            alert(error.message);

            return;
        }


        const profilePayload = {
            id: data.user.id,
            business_name: businessName,
            owner_pin: ownerPin || password,
            product: product,
            plain_password: password
        };

        const { error: profileError } =
            await client
                .from("profiles")
                .insert(profilePayload);


        if (profileError) {

            console.error(profileError);

            // If product column not yet added, retry without product
            if (profileError.message && profileError.message.includes("product")) {
                delete profilePayload.product;
                await client.from("profiles").insert(profilePayload);
            } else {
                alert(profileError.message);
                return;
            }
        }


        alert(
            `Account created successfully for ${product}!`
        );

        // Store selected product preference
        localStorage.setItem("kangro_active_product", product);

        window.location.href =
            "login.html";

    });

}
function getLocalDateString() {
    const now = new Date();

    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, "0");
    const day = String(now.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

// =====================================================
// LOGIN
// =====================================================

const loginBtn =
    document.getElementById("loginBtn");

if (loginBtn) {

    loginBtn.addEventListener("click", async () => {

        const email =
            document.getElementById("email").value.trim();

        const password =
            document.getElementById("password").value;


        const { data, error } =
            await client.auth.signInWithPassword({

                email,
                password

            });


        if (error) {

            alert(error.message);

            return;
        }

        // Check user profile for product routing
        try {
            if (data && data.user) {
                const { data: prof } = await client
                    .from("profiles")
                    .select("product")
                    .eq("id", data.user.id)
                    .maybeSingle();

                const userProduct = prof?.product || localStorage.getItem("kangro_active_product") || "SAL";
                localStorage.setItem("kangro_active_product", userProduct);

                if (userProduct === "POUCH") {
                    window.location.href = "pouch-dashboard.html";
                    return;
                }
            }
        } catch (e) {
            console.warn("Product routing check skipped:", e);
        }

        window.location.href =
            "dashboard.html";

    });

}


// =====================================================
// CHECK USER
// =====================================================

if (
    window.location.pathname
        .includes("dashboard.html")
) {

    checkUser();

}


async function checkUser() {

    const {
        data,
        error
    } = await client.auth.getSession();


    if (error || !data.session) {

        window.location.href =
            "login.html";

    }

}


// =====================================================
// LOGOUT
// =====================================================

const logoutBtn =
    document.getElementById("logoutBtn");

if (logoutBtn) {

    logoutBtn.addEventListener(
        "click",
        async () => {

            await client.auth.signOut();

            window.location.href =
                "login.html";

        }
    );

}


// =====================================================
// PROFILE
// =====================================================

async function loadProfile() {

    const {
        data: {
            user
        }
    } = await client.auth.getUser();


    if (!user) return;


    const {
        data,
        error
    } = await client
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .single();


    if (error) {

        console.error(
            "Profile error:",
            error
        );

        return;
    }


    const businessName =
        data.business_name ||
        "Glamour Studio";


    const topName =
        document.getElementById(
            "businessNameTop"
        );

    if (topName) {

        topName.textContent =
            businessName;

    }


    const sidebarName =
        document.getElementById(
            "sidebarBusinessName"
        );

    if (sidebarName) {

        sidebarName.textContent =
            businessName;

    }

}


// =====================================================
// SERVICE PRICES
// =====================================================

const SERVICE_PRICES = {

    haircut: 400,

    hairspa: 1200,

    haircoloring: 2500,

    facial: 900,

    pedicure: 800,

    manicure: 700

};


function getPrice(service) {

    return SERVICE_PRICES[

        (service || "")
            .toLowerCase()
            .replace(/\s+/g, "")

    ] || 0;

}


// =====================================================
// CHART VARIABLES
// =====================================================

let bookingChart = null;

let serviceChart = null;

let revenueChart = null;

let statusChart = null;


// =====================================================
// BOOKING ACTIVITY CHART
// =====================================================

function renderBookingActivityChart(bookings) {

    const canvas = document.getElementById("bookingChart");

    if (!canvas) return;

    if (bookingChart) {
        bookingChart.destroy();
    }

    const period =
        document.getElementById("chartPeriod")?.value || "This Week";

    const today = new Date();

    let labels = [];
    let values = [];

    // =========================
    // THIS WEEK
    // =========================

    if (period === "This Week") {

        for (let i = 6; i >= 0; i--) {

            const date = new Date(today);

            date.setDate(today.getDate() - i);

            const dateString =
                date.toISOString().split("T")[0];

            labels.push(
                date.toLocaleDateString("en-US", {
                    weekday: "short"
                })
            );

            const count =
                bookings.filter(booking => {

                    if (!booking.booking_date)
                        return false;

                    return (
                        booking.booking_date === dateString &&
                        (
                            booking.status || "Confirmed"
                        ).toLowerCase() !== "cancelled"
                    );

                }).length;

            values.push(count);
        }
    }

    // =========================
    // THIS MONTH
    // =========================

    else {

        const year = today.getFullYear();

        const month = today.getMonth();

        const daysInMonth =
            new Date(year, month + 1, 0).getDate();

        for (let day = 1; day <= daysInMonth; day++) {

            const dateString =
                `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

            labels.push(String(day));

            const count =
                bookings.filter(booking => {

                    if (!booking.booking_date)
                        return false;

                    return (
                        booking.booking_date === dateString &&
                        (
                            booking.status || "Confirmed"
                        ).toLowerCase() !== "cancelled"
                    );

                }).length;

            values.push(count);
        }
    }

    console.log("Booking chart labels:", labels);
    console.log("Booking chart values:", values);
    console.log("Bookings:", bookings);


    bookingChart = new Chart(
        canvas.getContext("2d"),
        {

            type: "bar",

            data: {

                labels: labels,

                datasets: [{

                    label: "Bookings",

                    data: values,

                    backgroundColor:
                        "rgba(233,130,114,0.25)",

                    borderColor:
                        "#e98272",

                    borderWidth: 2,

                    borderRadius: 7,

                    hoverBackgroundColor:
                        "#e98272"

                }]

            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: {
                        display: false
                    }

                },

                scales: {

                    x: {

                        grid: {
                            display: false
                        },

                        border: {
                            display: false
                        }

                    },

                    y: {

                        beginAtZero: true,

                        ticks: {
                            precision: 0
                        },

                        grid: {
                            color: "#edf0f3"
                        },

                        border: {
                            display: false
                        }

                    }

                }

            }

        }
    );
}

// =====================================================
// SERVICE CHART
// =====================================================

function renderServiceChart(
    bookings
) {

    const canvas =
        document.getElementById(
            "serviceChart"
        );


    if (!canvas) return;


    if (serviceChart) {

        serviceChart.destroy();

    }


    const counts = {};


    bookings.forEach(
        booking => {

            if (!booking.service)
                return;


            if (
                (
                    booking.status ||
                    "Confirmed"
                ).toLowerCase()
                === "cancelled"
            )
                return;


            const service =
                booking.service.trim();


            counts[service] =
                (
                    counts[service] ||
                    0
                ) + 1;

        }
    );


    let labels =
        Object.keys(counts);


    let values =
        Object.values(counts);


    if (!labels.length) {

        labels = [
            "No bookings"
        ];

        values = [0];

    }


    serviceChart =
        new Chart(
            canvas.getContext("2d"),
            {

                type: "doughnut",

                data: {

                    labels,

                    datasets: [{

                        data: values,

                        backgroundColor: [

                            "#e98272",

                            "#7c6ee6",

                            "#5bbf8a",

                            "#e6ad45",

                            "#6ba3d6",

                            "#b48ad9"

                        ],

                        borderWidth: 0

                    }]

                },

                options: {

                    responsive: true,

                    maintainAspectRatio:
                        false,

                    cutout: "62%",

                    plugins: {

                        legend: {

                            position: "bottom",

                            labels: {

                                boxWidth: 10,

                                padding: 12,

                                font: {
                                    size: 10
                                }

                            }

                        }

                    }

                }

            }
        );

}


// =====================================================
// REVENUE CHART
// =====================================================

function renderRevenueChart(bookings) {

    const canvas =
        document.getElementById("revenueChart");

    if (!canvas) return;

    if (revenueChart) {
        revenueChart.destroy();
    }

    const today = new Date();

    const labels = [];

    const revenue = [];


    // Last 7 days

    for (let i = 6; i >= 0; i--) {

        const date = new Date(today);

        date.setDate(
            today.getDate() - i
        );

        const year = date.getFullYear();
const month = String(date.getMonth() + 1).padStart(2, "0");
const day = String(date.getDate()).padStart(2, "0");

const dateString = `${year}-${month}-${day}`;

        labels.push(
            date.toLocaleDateString(
                "en-US",
                {
                    weekday: "short"
                }
            )
        );


        let total = 0;


        bookings.forEach(booking => {

            if (
                !booking.booking_date ||
                booking.booking_date !== dateString
            ) {
                return;
            }


            const status =
                (
                    booking.status ||
                    "Confirmed"
                ).toLowerCase();


            if (status === "cancelled") {
                return;
            }


            total += getPrice(
                booking.service
            );

        });


        revenue.push(total);

    }


    console.log(
        "Revenue chart:",
        revenue
    );


    revenueChart = new Chart(
        canvas.getContext("2d"),
        {

            type: "line",

            data: {

                labels: labels,

                datasets: [{

                    label: "Revenue",

                    data: revenue,

                    borderColor: "#e98272",

                    backgroundColor:
                        "rgba(233,130,114,0.12)",

                    fill: true,

                    tension: 0.4,

                    pointRadius: 5,

                    pointBackgroundColor:
                        "#e98272",

                    pointBorderWidth: 0

                }]

            },

            options: {

                responsive: true,

                maintainAspectRatio: false,

                plugins: {

                    legend: {
                        display: false
                    }

                },

                scales: {

                    x: {

                        grid: {
                            display: false
                        },

                        border: {
                            display: false
                        }

                    },

                    y: {

                        beginAtZero: true,

                        grid: {
                            color: "#edf0f3"
                        },

                        border: {
                            display: false
                        },

                        ticks: {

                            callback: function(value) {

                                return "₹" +
                                    Number(value)
                                    .toLocaleString("en-IN");

                            }

                        }

                    }

                }

            }

        }
    );
}

// =====================================================
// STATUS CHART
// =====================================================

function renderStatusChart(
    bookings
) {

    const canvas =
        document.getElementById(
            "statusChart"
        );


    if (!canvas) return;


    if (statusChart) {

        statusChart.destroy();

    }


    let confirmed = 0;

    let completed = 0;

    let pending = 0;

    let cancelled = 0;


    bookings.forEach(
        booking => {

            const status =
                (
                    booking.status ||
                    "Confirmed"
                ).toLowerCase();


            if (
                status === "confirmed"
            )
                confirmed++;

            else if (
                status === "completed"
            )
                completed++;

            else if (
                status === "pending"
            )
                pending++;

            else if (
                status === "cancelled"
            )
                cancelled++;

        }
    );


    statusChart =
        new Chart(
            canvas.getContext("2d"),
            {

                type: "bar",

                data: {

                    labels: [

                        "Confirmed",

                        "Completed",

                        "Pending",

                        "Cancelled"

                    ],

                    datasets: [{

                        data: [

                            confirmed,

                            completed,

                            pending,

                            cancelled

                        ],

                        backgroundColor: [

                            "#2d5fa8",

                            "#2aafa4",

                            "#9db6d5",

                            "#e29a9a"

                        ],

                        borderRadius: 6,

                        barPercentage:
                            0.65

                    }]

                },

                options: {

                    indexAxis: "y",

                    responsive: true,

                    maintainAspectRatio:
                        false,

                    plugins: {

                        legend: {
                            display: false
                        }

                    },

                    scales: {

                        x: {

                            beginAtZero: true,

                            ticks: {
                                precision: 0
                            },

                            grid: {
                                color: "#edf0f3"
                            },

                            border: {
                                display: false
                            }

                        },

                        y: {

                            grid: {
                                display: false
                            },

                            border: {
                                display: false
                            }

                        }

                    }

                }

            }
        );

}


// =====================================================
// TODAY'S APPOINTMENTS
// =====================================================

function renderTodayAppointments(
    bookings
) {

    const container =
        document.getElementById(
            "todayAppointments"
        );


    if (!container) return;


    const today = getLocalDateString();


    const todayBookings =
        bookings

            .filter(
                booking =>
                    booking.booking_date
                    === today
            )

            .filter(
                booking =>
                    (
                        booking.status ||
                        "Confirmed"
                    ).toLowerCase()
                    !== "cancelled"
            )

            .sort(
                (a, b) =>
                    (
                        a.booking_time || ""
                    ).localeCompare(
                        b.booking_time || ""
                    )
            );


    document.getElementById(
        "todayAppointmentCount"
    ).textContent =
        todayBookings.length;


    if (!todayBookings.length) {

        container.innerHTML = `

            <div class="empty">

                No appointments today

            </div>

        `;

        return;

    }


    container.innerHTML = "";


    todayBookings
        .slice(0, 6)
        .forEach(
            booking => {

                let time = "-";


                if (
                    booking.booking_time
                ) {

                    time =
                        new Date(
                            `1970-01-01T${booking.booking_time}`
                        )
                            .toLocaleTimeString(
                                [],
                                {
                                    hour:
                                        "numeric",

                                    minute:
                                        "2-digit"
                                }
                            );

                }


                container.innerHTML += `

                    <div class="appointment">

                        <div class="appointment-dot"></div>

                        <div class="appointment-time">
                            ${time}
                        </div>

                        <div class="appointment-info">

                            <div class="appointment-name">
                                ${
                                    booking.customer_name ||
                                    "Customer"
                                }
                            </div>

                            <div class="appointment-service">
                                ${
                                    booking.service ||
                                    "-"
                                }
                            </div>

                        </div>

                        <div class="arrow">
                            ›
                        </div>

                    </div>

                `;

            }
        );

}


// =====================================================
// RENDER TABLE
// =====================================================

// =====================================================
// RENDER BOOKINGS WITH DATE SECTIONS
// =====================================================

function renderBookings(bookings) {

    const table =
        document.getElementById(
            "bookingTable"
        );

    if (!table) return;


    document.getElementById(
        "bookingCount"
    ).textContent =
        bookings.length;


    if (!bookings.length) {

        table.innerHTML = `
            <tr>
                <td
                    colspan="8"
                    class="empty"
                >
                    No bookings found
                </td>
            </tr>
        `;

        return;
    }


    // =================================================
    // DATE HELPERS
    // =================================================

    const today =
        getLocalDateString();

    const yesterday =
        getDateOffset(-1);

    const tomorrow =
        getDateOffset(1);


    // =================================================
    // GROUP BOOKINGS
    // =================================================

    const groups = {

        today: [],

        yesterday: [],

        tomorrow: [],

        upcoming: [],

        past: []

    };


    bookings.forEach(
        booking => {

            const date =
                booking.booking_date;


            if (!date) {

                groups.upcoming.push(
                    booking
                );

                return;
            }


            if (date === today) {

                groups.today.push(
                    booking
                );

            }

            else if (
                date === yesterday
            ) {

                groups.yesterday.push(
                    booking
                );

            }

            else if (
                date === tomorrow
            ) {

                groups.tomorrow.push(
                    booking
                );

            }

            else if (
                date > tomorrow
            ) {

                groups.upcoming.push(
                    booking
                );

            }

            else {

                groups.past.push(
                    booking
                );

            }

        }
    );


    // =================================================
    // SECTION RENDERER
    // =================================================

    let html = "";


    function addSection(
        title,
        items
    ) {

        if (!items.length) {
            return;
        }


        html += `
            <tr class="booking-section-row">
                <td colspan="8">
                    <div class="booking-section-title">
                        ${title}
                        <span class="booking-section-count">
                            ${items.length}
                        </span>
                    </div>
                </td>
            </tr>
        `;


        items.forEach(
            (booking, index) => {

                const status =
                    booking.status ||
                    "Confirmed";


                const statusLower =
                    status.toLowerCase();


                const statusClass =
                    statusLower ===
                    "cancelled"

                        ? "status-cancelled"

                        : statusLower ===
                          "pending"

                        ? "status-pending"

                        : "status-confirmed";


                // =============================
                // TIME
                // =============================

                let time = "-";


                if (
                    booking.booking_time
                ) {

                    time =
                        new Date(
                            `1970-01-01T${booking.booking_time}`
                        )
                            .toLocaleTimeString(
                                [],
                                {
                                    hour:
                                        "numeric",

                                    minute:
                                        "2-digit"
                                }
                            );

                }


                // =============================
                // DATE
                // =============================

                let date = "-";


                if (
                    booking.booking_date
                ) {

                    date =
                        new Date(
                            booking.booking_date
                        )
                            .toLocaleDateString(
                                "en-IN",
                                {
                                    day:
                                        "2-digit",

                                    month:
                                        "short"
                                }
                            );

                }


                html += `
                    <tr>

                        <td>
                            #${String(
                                index + 1
                            ).padStart(
                                3,
                                "0"
                            )}
                        </td>


                        <td class="customer">
                            ${
                                booking.customer_name ||
                                "-"
                            }
                        </td>


                        <td>
                            ${
                                booking.phone ||
                                "-"
                            }
                        </td>


                        <td>

                            <span
                                class="service-tag"
                            >
                                ${
                                    booking.service ||
                                    "-"
                                }
                            </span>

                        </td>


                        <td>
                            ${
                                booking.staff ||
                                "-"
                            }
                        </td>


                        <td>
                            ${date}
                        </td>


                        <td>
                            ${time}
                        </td>


                        <td>

                            <span
                                class="status ${statusClass}"
                            >
                                ${status}
                            </span>

                        </td>
                        <td>
    <div class="action-wrapper">

        <button
            type="button"
            class="action-btn"
            onclick="toggleActions(this)"
        >
            Actions
            <span class="action-chevron">⌄</span>
        </button>

        <div class="action-menu">

            ${
                status.toLowerCase() === "cancelled"

                ? `
                    <button
                        type="button"
                        class="action-item restore"
                        data-id="${booking.id}"
                    >
                        <span class="action-icon">↻</span>
                        <span>Restore Booking</span>
                    </button>

                    <button
    type="button"
    class="action-item delete"
    data-id="${booking.id}"
    onclick="deleteBooking('${booking.id}')"
>
    <span class="action-icon">🗑</span>
    <span>Delete Booking</span>
</button>
                `

                : `
                    <button
                        type="button"
                        class="action-item bill"
                        onclick="openBilling('${booking.id}')"
                    >
                        <span class="action-icon">🧾</span>
                        <span>Generate Bill</span>
                    </button>

                    <button
    type="button"
    class="action-item cancel"
    data-id="${booking.id}"
    onclick="cancelBooking('${booking.id}')"
>
    <span class="action-icon">×</span>
    <span>Cancel Booking</span>
</button>
                `
            }

        </div>

    </div>
</td>


                    </tr>
                `;

            }
        );

    }


    // =================================================
    // ADD SECTIONS
    // =================================================

    addSection(
        "Today",
        groups.today
    );

    addSection(
        "Yesterday",
        groups.yesterday
    );

    addSection(
        "Tomorrow",
        groups.tomorrow
    );

    addSection(
        "Upcoming",
        groups.upcoming
    );

    addSection(
        "Past",
        groups.past
    );


    table.innerHTML =
        html;

}


    // =====================================================
// CANCEL
// =====================================================

async function cancelBooking(id) {

    if (!confirm("Cancel this booking?")) {
        return;
    }

    await updateBookingStatus(
        id,
        "Cancelled"
    );
}


    // RESTORE

    document
        .querySelectorAll(
            ".restore-btn"
        )
        .forEach(
            button => {

                button.onclick =
                    async () => {

                        await updateBookingStatus(
                            button.dataset.id,
                            "Confirmed"
                        );

                    };

            }
        );



// =====================================================
// APPOINTMENT FILTER
// =====================================================

function getLocalDateString(date = new Date()) {

    const year =
        date.getFullYear();

    const month =
        String(
            date.getMonth() + 1
        ).padStart(2, "0");

    const day =
        String(
            date.getDate()
        ).padStart(2, "0");

    return `${year}-${month}-${day}`;
}


function getDateOffset(days) {

    const date = new Date();

    date.setDate(
        date.getDate() + days
    );

    return getLocalDateString(date);
}


function applyBookingFilter(
    bookings,
    filter
) {

    const today =
        getLocalDateString();

    const yesterday =
        getDateOffset(-1);

    const tomorrow =
        getDateOffset(1);


    switch (filter) {

        case "today":

            return bookings.filter(
                booking =>
                    booking.booking_date === today
            );


        case "yesterday":

            return bookings.filter(
                booking =>
                    booking.booking_date === yesterday
            );


        case "tomorrow":

            return bookings.filter(
                booking =>
                    booking.booking_date === tomorrow
            );


        case "upcoming":

            return bookings.filter(
                booking => {

                    if (!booking.booking_date)
                        return false;

                    return (
                        booking.booking_date > today
                        &&
                        (
                            booking.status ||
                            "Confirmed"
                        ).toLowerCase()
                        !== "cancelled"
                    );

                }
            );


        case "past":

            return bookings.filter(
                booking => {

                    if (!booking.booking_date)
                        return false;

                    return (
                        booking.booking_date < today
                    );

                }
            );


        case "cancelled":

            return bookings.filter(
                booking =>
                    (
                        booking.status ||
                        ""
                    ).toLowerCase()
                    === "cancelled"
            );


        case "all":

        default:

            return bookings;

    }

}
// =====================================================
// FILTER UI
// =====================================================

const filterBtn =
    document.getElementById("filterBtn");

const filterWrapper =
    document.querySelector(".filter-wrapper");

const filterMenu =
    document.getElementById("filterMenu");


let currentBookingFilter = "today";


if (
    filterBtn &&
    filterMenu &&
    filterWrapper
) {

    filterBtn.addEventListener(
        "click",
        function (event) {

            event.stopPropagation();

            filterWrapper.classList.toggle(
                "open"
            );

        }
    );


    filterMenu
        .querySelectorAll("button[data-filter]")
        .forEach(button => {

            button.addEventListener(
                "click",
                function () {

                    currentBookingFilter =
                        this.dataset.filter;


                    // Highlight selected filter

                    filterMenu
                        .querySelectorAll(
                            "button[data-filter]"
                        )
                        .forEach(btn => {

                            btn.classList.remove(
                                "active"
                            );

                        });


                    this.classList.add(
                        "active"
                    );


                    // Get current bookings

                    const filteredBookings =
                        applyBookingFilter(
                            window.dashboardBookings || [],
                            currentBookingFilter
                        );


                    renderBookings(
                        filteredBookings
                    );


                    filterWrapper.classList.remove(
                        "open"
                    );

                }
            );

        });


    document.addEventListener(
        "click",
        function () {

            filterWrapper.classList.remove(
                "open"
            );

        }
    );

}
// =====================================================
// LOAD BOOKINGS FROM SUPABASE
// =====================================================

async function loadBookings() {

    console.log(
        "Loading bookings..."
    );


    const {
        data: {
            user
        }
    } =
        await client.auth.getUser();


    if (!user) {

        console.log(
            "No logged-in user."
        );

        return;

    }


    console.log(
        "Logged-in user:",
        user.id
    );


    const {
        data: bookings,
        error
    } =
        await client

            .from("bookings")

            .select("*")

            .eq(
                "profile_id",
                user.id
            )

            .order(
                "created_at",
                {
                    ascending:
                        false
                }
            );


    if (error) {

        console.error(
            "BOOKING ERROR:",
            error
        );

        return;

    }


    const safeBookings =
        bookings || [];
        window.dashboardBookings =
    safeBookings;


    console.log(
        "Bookings loaded:",
        safeBookings
    );


    // =================================================
    // BASIC NUMBERS
    // =================================================

    const today = getLocalDateString();


    const totalBookings =
        safeBookings.length;


    const todayBookings =
        safeBookings.filter(
            booking =>
                booking.booking_date
                === today
        ).length;


    const upcomingBookings =
        safeBookings.filter(
            booking => {

                if (
                    !booking.booking_date
                )
                    return false;


                return (

                    booking.booking_date
                    >= today

                    &&

                    (
                        booking.status ||
                        "Confirmed"
                    ).toLowerCase()
                    !== "cancelled"

                );

            }
        ).length;


    // =================================================
    // MOST POPULAR SERVICE
    // =================================================

    const serviceCounts = {};


    safeBookings.forEach(
        booking => {

            if (
                !booking.service
            )
                return;


            if (
                (
                    booking.status ||
                    "Confirmed"
                ).toLowerCase()
                === "cancelled"
            )
                return;


            const service =
                booking.service;


            serviceCounts[service] =
                (
                    serviceCounts[service] ||
                    0
                ) + 1;

        }
    );


    let mostPopular = "-";

    let highest = 0;


    Object.keys(
        serviceCounts
    ).forEach(
        service => {

            if (
                serviceCounts[service]
                > highest
            ) {

                highest =
                    serviceCounts[
                        service
                    ];

                mostPopular =
                    service;

            }

        }
    );


    // =================================================
    // UPDATE KPI
    // =================================================

    document.getElementById(
        "totalBookings"
    ).textContent =
        totalBookings;


    document.getElementById(
        "todayBookings"
    ).textContent =
        todayBookings;


    document.getElementById(
        "upcomingBookings"
    ).textContent =
        upcomingBookings;


    document.getElementById(
        "mostPopular"
    ).textContent =
        mostPopular;


    // =================================================
    // TABLE
    // =================================================

    // =================================================
// TABLE
// =================================================

let filteredBookings;

if (currentBookingFilter === "today") {

    filteredBookings = safeBookings.filter(
        booking =>
            booking.booking_date >= getLocalDateString()
            &&
            (
                booking.status || "Confirmed"
            ).toLowerCase() !== "cancelled"
    );

} else {

    filteredBookings =
        applyBookingFilter(
            safeBookings,
            currentBookingFilter
        );

}

renderBookings(
    filteredBookings
);


    // =================================================
    // TODAY
    // =================================================

    renderTodayAppointments(
        safeBookings
    );


    // =================================================
    // CHARTS
    // =================================================

    renderBookingActivityChart(
        safeBookings
    );


    renderServiceChart(
        safeBookings
    );


    renderRevenueChart(
        safeBookings
    );


    renderStatusChart(
        safeBookings
    );


    // =================================================
    // SEARCH
    // =================================================

    const searchInput =
        document.getElementById(
            "searchInput"
        );


    if (searchInput) {

        searchInput.oninput =
            () => {

                const value =
                    searchInput.value
                        .toLowerCase()
                        .trim();


                const filtered =
                    safeBookings.filter(
                        booking =>

                            (
                                booking.customer_name ||
                                ""
                            )
                                .toLowerCase()
                                .includes(
                                    value
                                )

                            ||

                            (
                                booking.phone ||
                                ""
                            )
                                .toLowerCase()
                                .includes(
                                    value
                                )

                            ||

                            (
                                booking.service ||
                                ""
                            )
                                .toLowerCase()
                                .includes(
                                    value
                                )

                    );


                renderBookings(
                    filtered
                );

            };

    }

}


// =====================================================
// UPDATE BOOKING STATUS
// =====================================================

async function updateBookingStatus(
    id,
    status
) {

    const {
        error
    } =
        await client

            .from("bookings")

            .update({
                status: status
            })

            .eq(
                "id",
                id
            );


    if (error) {

        console.error(
            error
        );

        alert(
            "Failed to update booking."
        );

        return;

    }


    await loadBookings();

}


// =====================================================
// INITIALIZE DASHBOARD
// =====================================================

if (
    window.location.pathname
        .includes("dashboard.html")
) {

    loadProfile();

    loadBookings();

}


// =====================================================
// AUTO REFRESH
// =====================================================

setInterval(
    () => {

        if (
            window.location.pathname
                .includes("dashboard.html")
        ) {

            loadBookings();

        }

    },
    10000
);

const chartPeriod =
    document.getElementById("chartPeriod");

if (chartPeriod) {

    chartPeriod.addEventListener(
        "change",
        async function() {

            await loadBookings();

        }
    );

}
function openBilling(bookingId) {

    window.location.href =
        `billing.html?booking=${bookingId}`;

}

async function deleteBooking(id) {

    const confirmed = confirm(
        "Permanently delete this cancelled booking?\n\nThis cannot be undone."
    );

    if (!confirmed) {
        return;
    }

    const { error } = await client
        .from("bookings")
        .delete()
        .eq("id", id);

    if (error) {
        console.error("DELETE BOOKING ERROR:", error);

        alert("Failed to delete booking.");
        return;
    }

    alert("Booking deleted successfully.");

    await loadBookings();
}
// =====================================================
// ACTION DROPDOWN
// =====================================================

function toggleActions(button) {

    const wrapper =
        button.closest(".action-wrapper");

    // Close other open menus
    document
        .querySelectorAll(".action-wrapper.open")
        .forEach(menu => {

            if (menu !== wrapper) {
                menu.classList.remove("open");
            }

        });

    wrapper.classList.toggle("open");
}


// Close dropdown when clicking outside

document.addEventListener("click", function(event) {

    if (!event.target.closest(".action-wrapper")) {

        document
            .querySelectorAll(".action-wrapper.open")
            .forEach(menu => {

                menu.classList.remove("open");

            });

    }

});