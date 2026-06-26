const { getMemberSavings, getSystemLiquidity } = require('./utils/helpers');

async function verify() {
    const savings = await getMemberSavings(1);
    const liquidity = await getSystemLiquidity();
    console.log(`Member 1 Savings:    KES ${savings.toLocaleString()}`);
    console.log(`Max Loan Limit (3x): KES ${(savings * 3).toLocaleString()}`);
    console.log(`System Liquidity:    KES ${liquidity.toLocaleString()}`);
    process.exit(0);
}
verify().catch(e => { console.error(e.message); process.exit(1); });
