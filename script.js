// --- CONFIGURATION ---
const supabaseClient = supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY);

// --- NAVIGATION ---
function showSection(id) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    if(id === 'dashboard') loadDashboard();
    if(id === 'all-customers') loadAllCustomers();
}

// --- DASHBOARD ---
async function loadDashboard() {
    const { count } = await supabaseClient
        .from('customers')
        .select('*', { count: 'exact', head: true });
    
    document.getElementById('total-customers').innerText = count || 0;

    const { data } = await supabaseClient.from('customers').select('current_balance');
    const total = data ? data.reduce((sum, row) => sum + (row.current_balance || 0), 0) : 0;
    document.getElementById('total-money').innerText = `₦ ${total.toLocaleString()}`;
}

// --- REGISTER ---
const registerForm = document.getElementById('register-form');
if(registerForm){
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('reg-name').value;
        const readable_id = document.getElementById('reg-id').value;
        const pin = document.getElementById('reg-pin').value; // NEW
        const rate = document.getElementById('reg-rate').value;

        const { error } = await supabaseClient.from('customers').insert([
            { 
                full_name: name, 
                readable_id: readable_id, 
                pin: pin, // NEW
                daily_rate: rate 
            }
        ]);

        if (error) alert('Error: ' + error.message);
        else {
            alert('Customer Created Successfully!');
            e.target.reset();
        }
    });
}

// --- ALL CUSTOMERS ---
async function loadAllCustomers() {
    const { data } = await supabaseClient.from('customers').select('*').order('created_at');
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
                </tr>`;
        });
    }
}

// --- DEPOSIT & WITHDRAWAL LOGIC ---

let currentCustomer = null;
let currentMode = '';

async function loadCustomerLedger(inputId, mode) {
    const searchId = document.getElementById(inputId).value;
    currentMode = mode;

    // 1. Find Customer
    const { data: customers, error } = await supabaseClient
        .from('customers')
        .select('*')
        .eq('readable_id', searchId);

    if (error || !customers || !customers.length) {
        alert('Customer not found');
        return;
    }

    currentCustomer = customers[0];
    
    // Update UI Header
    const prefix = mode === 'deposit' ? 'dep' : 'with';
    document.getElementById(`${prefix}-profile`).classList.remove('hidden');
    document.getElementById(`${prefix}-name`).innerText = currentCustomer.full_name;
    document.getElementById(`${prefix}-balance`).innerText = `₦ ${currentCustomer.current_balance.toLocaleString()}`;
    if(mode === 'deposit') document.getElementById(`dep-rate`).innerText = `₦ ${currentCustomer.daily_rate}`;

    // 2. Fetch Checkbox State (daily_checklist)
    const { data: logs } = await supabaseClient
        .from('daily_checklist')
        .select('*')
        .eq('customer_id', currentCustomer.id);

    const paidMap = {};
    if(logs) {
        logs.forEach(log => {
            paidMap[`${log.month_index}-${log.day_index}`] = true;
        });
    }

    // 3. Render Grid
    const container = document.getElementById(`${prefix}-grid`);
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
            checkbox.addEventListener('change', (e) => handleCheck(e.target, m, d));
            daysDiv.appendChild(checkbox);
        }
        monthDiv.appendChild(daysDiv);
        container.appendChild(monthDiv);
    }
}

async function handleCheck(checkbox, monthIndex, dayIndex) {
    const amount = parseFloat(currentCustomer.daily_rate);
    const desc = `Contribution: Month ${monthIndex + 1}, Day ${dayIndex}`;

    // --- DEPOSIT (CHECKED) ---
    if (checkbox.checked) {
        // A. Save Checkbox State
        const { error: stateError } = await supabaseClient
            .from('daily_checklist')
            .insert([{ customer_id: currentCustomer.id, month_index: monthIndex, day_index: dayIndex }]);

        if (stateError) {
            alert("Error: " + stateError.message);
            checkbox.checked = false; 
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
            alert("Error: " + delError.message);
            checkbox.checked = true;
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
    await supabaseClient
        .from('customers')
        .update({ current_balance: newBalance })
        .eq('id', currentCustomer.id);

    currentCustomer.current_balance = newBalance;
    
    ['dep', 'with'].forEach(prefix => {
        const el = document.getElementById(`${prefix}-balance`);
        if(el) el.innerText = `₦ ${newBalance.toLocaleString()}`;
    });
}