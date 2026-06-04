export async function onRequestGet(context) {
  // Bindings are available on context.env
  const { DONATION_STORE } = context.env;
  
  if (!DONATION_STORE) {
    // If KV is not bound yet, return fallback mock values
    return new Response(JSON.stringify({ currentAmount: 1900, totalDonors: 9 }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });
  }

  const currentAmount = await DONATION_STORE.get("currentAmount");
  const totalDonors = await DONATION_STORE.get("totalDonors");

  return new Response(
    JSON.stringify({
      currentAmount: currentAmount ? parseFloat(currentAmount) : 1900,
      totalDonors: totalDonors ? parseInt(totalDonors) : 9
    }),
    {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    }
  );
}

export async function onRequestPost(context) {
  const { DONATION_STORE } = context.env;
  
  if (!DONATION_STORE) {
    return new Response(JSON.stringify({ error: "KV binding 'DONATION_STORE' is missing." }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });
  }

  try {
    const { amount } = await context.request.json();
    const donationAmount = parseFloat(amount);
    
    if (isNaN(donationAmount) || donationAmount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount." }), {
        status: 400,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        }
      });
    }

    // Get current values
    let currentAmount = parseFloat(await DONATION_STORE.get("currentAmount") || 1900);
    let totalDonors = parseInt(await DONATION_STORE.get("totalDonors") || 9);

    // Update values
    currentAmount += donationAmount;
    totalDonors += 1;

    // Save updated values to KV
    await DONATION_STORE.put("currentAmount", currentAmount.toString());
    await DONATION_STORE.put("totalDonors", totalDonors.toString());

    return new Response(JSON.stringify({ success: true, currentAmount, totalDonors }), {
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      }
    });
  }
}

// Handle preflight requests for CORS (just in case they test cross-origin)
export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400"
    }
  });
}
