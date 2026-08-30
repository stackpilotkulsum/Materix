const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

async function checkCols() {
    const { data: materials, error } = await supabaseAdmin.from('materials').select('*').limit(1);
    if (error) {
        console.error("Query Error:", error);
    } else {
        console.log("Columns:", Object.keys(materials[0] || {}));
    }
}
checkCols();
