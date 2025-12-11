const SUPABASE_URL = "https://yewqtqalasmospplgdwb.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inlld3F0cWFsYXNtb3NwcGxnZHdiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUxMTU0NjgsImV4cCI6MjA4MDY5MTQ2OH0.__gpV6kX8R0rTv0y_vqNeOgqLEFE9q_hRSS1WDdkw0M";

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// --- NAVIGATION ---
function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(id === 'dashboard') loadDashboard();
    if(id === 'all-customers') loadAllCustomers();
}

// --- DASHBOARD ---
async function loadDashboard() {
    // 1. Get Customer Count
    const { count, error: countError } = await supabaseClient
        .from('customers')
        .select('*', { count: 'exact', head: true });
    
    if (countError) console.error("Dashboard Error:", countError);
    document.getElementById('total-customers').innerText = count || 0;

    // 2. Get Total Money
    const { data, error: moneyError } = await supabaseClient.from('customers').select('current_balance');
    
    if (moneyError) console.error("Money Error:", moneyError);
    
    const total = data ? data.reduce((sum, row) => sum + (row.current_balance || 0), 0) : 0;
    document.getElementById('total-money').innerText = `₦ ${total.toLocaleString()}`;
}

// --- REGISTER (WITH EMAIL & PIN) ---
const registerForm = document.getElementById('register-form');
if(registerForm){
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value.trim(); // NEW
        const readable_id = document.getElementById('reg-id').value;
        const pin = document.getElementById('reg-pin').value;
        const rate = document.getElementById('reg-rate').value;

        console.log("Attempting to register:", name, email);

        const { error } = await supabaseClient.from('customers').insert([
            { 
                full_name: name,
                email: email, // NEW
                readable_id: readable_id, 
                pin: pin, 
                daily_rate: rate 
            }
        ]);

        if (error) {
            alert('Error creating customer: ' + error.message);
            console.error(error);
        } else {
            alert('Customer Created Successfully!');
            e.target.reset();
        }
    });
}

// --- ALL CUSTOMERS LIST ---
async function loadAllCustomers() {
    const { data, error } = await supabaseClient
        .from('customers')
        .select('*')
        .order('created_at');

    if(error) {
        console.error("Error loading customers:", error);
        return;
    }

    const tbody = document.querySelector('#customers-table tbody');
    tbody.innerHTML = '';
    
    if(data) {
        data.forEach(c => {
            tbody.innerHTML += `
                <tr>
                    <td>${c.readable_id}</td>
                    <td>${c.full_name}</td>
                    <td>${c.daily_rate}</td>
                    <td>₦ ${c.current_balance.toLocaleString()}</td>
                    <td>
                        <button 
                            onclick="deleteCustomer('${c.id}', '${c.full_name}')" 
                            style="background-color: #ff4444; color: white; border: none; padding: 5px 10px; cursor: pointer; border-radius: 4px;">
                            Delete
                        </button>
                    </td>
                </tr>`;
        });
    }
}
// --- DEPOSIT & WITHDRAWAL LOGIC ---

let currentCustomer = null;

// This function is called by the "Search" button in HTML
async function loadCustomerLedger(inputId, mode) {
    console.log(`Searching for user using input ID: ${inputId} in mode: ${mode}`);

    const searchInput = document.getElementById(inputId);
    if (!searchInput) {
        console.error("Input field not found in HTML:", inputId);
        return;
    }

    const searchId = searchInput.value;
    if (!searchId) {
        alert("Please enter a Customer ID");
        return;
    }

    // 1. Find Customer
    const { data: customers, error } = await supabaseClient
        .from('customers')
        .select('*')
        .eq('readable_id', searchId);

    if (error) {
        console.error("Supabase Error:", error);
        alert("Database error. Check console.");
        return;
    }

    if (!customers || customers.length === 0) {
        alert('Customer ID not found. Did you register them?');
        return;
    }

    currentCustomer = customers[0];
    console.log("Customer found:", currentCustomer);
    
    // 2. Update UI Header
    const prefix = mode === 'deposit' ? 'dep' : 'with';
    
    // Un-hide the profile card
    const profileCard = document.getElementById(`${prefix}-profile`);
    if(profileCard) profileCard.classList.remove('hidden');

    document.getElementById(`${prefix}-name`).innerText = currentCustomer.full_name;
    document.getElementById(`${prefix}-balance`).innerText = `₦ ${currentCustomer.current_balance.toLocaleString()}`;
    
    // Only show rate on deposit page
    if(mode === 'deposit') {
        const rateEl = document.getElementById(`dep-rate`);
        if(rateEl) rateEl.innerText = `₦ ${currentCustomer.daily_rate}`;
    }

    // 3. Fetch Checkbox State (daily_checklist)
    const { data: logs, error: logError } = await supabaseClient
        .from('daily_checklist')
        .select('*')
        .eq('customer_id', currentCustomer.id);

    if (logError) console.error("Error fetching checklist:", logError);

    // Create a lookup map: "month-day" -> true
    const paidMap = {};
    if(logs) {
        logs.forEach(log => {
            paidMap[`${log.month_index}-${log.day_index}`] = true;
        });
    }

    // 4. Render Grid
    const container = document.getElementById(`${prefix}-grid`);
    if (!container) {
        console.error(`Grid container ${prefix}-grid not found!`);
        return;
    }

    container.innerHTML = '';
    container.classList.remove('hidden');

    for (let m = 0; m < 24; m++) {
        const monthDiv = document.createElement('div');
        monthDiv.className = 'month-card';
        monthDiv.innerHTML = `<span class="month-title">Month ${m + 1}</span>`;

        const daysDiv = document.createElement('div');
        daysDiv.className = 'days-grid';

        for (let d = 1; d <= 31; d++) {
            const isPaid = paidMap[`${m}-${d}`];
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'day-check';
            checkbox.checked = !!isPaid;
            
            // Add click event
            checkbox.addEventListener('change', (e) => handleCheck(e.target, m, d));

            daysDiv.appendChild(checkbox);
        }
        monthDiv.appendChild(daysDiv);
        container.appendChild(monthDiv);
    }
}

async function handleCheck(checkbox, monthIndex, dayIndex) {
    if (!currentCustomer) return;

    const amount = parseFloat(currentCustomer.daily_rate);
    const desc = `Contribution: Month ${monthIndex + 1}, Day ${dayIndex}`;

    console.log(`Processing ${checkbox.checked ? 'Deposit' : 'Withdrawal'} for M${monthIndex + 1} D${dayIndex}`);

    // --- DEPOSIT (CHECKED) ---
    if (checkbox.checked) {
        // A. Save Checkbox State
        const { error: stateError } = await supabaseClient
            .from('daily_checklist')
            .insert([{ customer_id: currentCustomer.id, month_index: monthIndex, day_index: dayIndex }]);

        if (stateError) {
            alert("Error saving state: " + stateError.message);
            checkbox.checked = false; // Undo check
            return;
        }

        // B. Add Transaction Log
        await supabaseClient.from('transactions').insert([{
            customer_id: currentCustomer.id,
            type: 'DEPOSIT',
            amount: amount,
            description: desc
        }]);

        // C. Update Balance
        const newBal = parseFloat(currentCustomer.current_balance) + amount;
        await updateBalance(newBal);

    } 
    // --- WITHDRAWAL (UNCHECKED) ---
    else {
        // A. Remove Checkbox State
        const { error: delError } = await supabaseClient
            .from('daily_checklist')
            .delete()
            .match({ customer_id: currentCustomer.id, month_index: monthIndex, day_index: dayIndex });

        if (delError) {
            alert("Error removing state: " + delError.message);
            checkbox.checked = true; // Undo uncheck
            return;
        }

        // B. Add Transaction Log (Negative)
        await supabaseClient.from('transactions').insert([{
            customer_id: currentCustomer.id,
            type: 'WITHDRAWAL',
            amount: -amount,
            description: `Reversal: Month ${monthIndex + 1}, Day ${dayIndex}`
        }]);

        // C. Update Balance
        const newBal = parseFloat(currentCustomer.current_balance) - amount;
        await updateBalance(newBal);
    }
}

async function updateBalance(newBalance) {
    // Update Database
    const { error } = await supabaseClient
        .from('customers')
        .update({ current_balance: newBalance })
        .eq('id', currentCustomer.id);

    if (error) {
        console.error("Balance Update Error:", error);
        alert("Failed to update balance in database");
        return;
    }

    // Update Local Data & UI
    currentCustomer.current_balance = newBalance;
    
    const depBal = document.getElementById('dep-balance');
    const withBal = document.getElementById('with-balance');
    
    if(depBal) depBal.innerText = `₦ ${newBalance.toLocaleString()}`;
    if(withBal) withBal.innerText = `₦ ${newBalance.toLocaleString()}`;
}

// --- DELETE CUSTOMER ---
async function deleteCustomer(uuid, name) {
    // 1. Confirm with the Admin
    const confirmed = confirm(`Are you sure you want to delete ${name}? \n\nThis will permanently delete their TRANSACTION HISTORY and BALANCE. This cannot be undone.`);
    
    if (!confirmed) return;

    // 2. Delete from 'daily_checklist' (The ticks)
    const { error: checkError } = await supabaseClient
        .from('daily_checklist')
        .delete()
        .eq('customer_id', uuid);

    if (checkError) {
        alert("Error deleting checklist: " + checkError.message);
        return;
    }

    // 3. Delete from 'transactions' (The history)
    const { error: transError } = await supabaseClient
        .from('transactions')
        .delete()
        .eq('customer_id', uuid);

    if (transError) {
        alert("Error deleting transactions: " + transError.message);
        return;
    }

    // 4. Finally, Delete the Customer
    const { error: custError } = await supabaseClient
        .from('customers')
        .delete()
        .eq('id', uuid);

    if (custError) {
        alert("Error deleting customer: " + custError.message);
    } else {
        alert(`${name} has been deleted.`);
        loadAllCustomers(); // Refresh the list
        loadDashboard();    // Update the total money stats
    }
}