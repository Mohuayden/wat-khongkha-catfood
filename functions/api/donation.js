export async function onRequestGet(context) {
  // Bindings are available on context.env
  const { DONATION_STORE } = context.env;
  
  if (!DONATION_STORE) {
    // If KV is not bound yet, return fallback mock values
    return new Response(JSON.stringify({ currentAmount: 0, totalDonors: 0 }), {
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
      currentAmount: currentAmount ? parseFloat(currentAmount) : 0,
      totalDonors: totalDonors ? parseInt(totalDonors) : 0
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
  const { DONATION_STORE, SLIPOK_API_KEY, SLIPOK_BRANCH_ID } = context.env;
  
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
    const body = await context.request.json();
    const { amount, qrData } = body;

    let donationAmount = 0;
    let transRef = "";
    let isVerified = false;
    let warning = null;

    // 1. If qrData is provided, check if we can verify via SlipOK API
    if (qrData) {
      if (!SLIPOK_API_KEY || !SLIPOK_BRANCH_ID) {
        // Fallback: Environment variables not configured, perform a trust-based update
        warning = "SlipOK API credentials are not configured. Running in simulated mode.";
        donationAmount = parseFloat(amount);
        if (isNaN(donationAmount) || donationAmount <= 0) {
          return new Response(JSON.stringify({ error: "กรุณาระบุยอดเงินที่ถูกต้องสำหรับการจำลอง" }), {
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            }
          });
        }
      } else {
        // Live verification using SlipOK API
        const response = await fetch(`https://api.slipok.com/api/line/apikey/${SLIPOK_BRANCH_ID}`, {
          method: "POST",
          headers: {
            "x-authorization": SLIPOK_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            data: qrData,
            log: true
          })
        });

        const slipResult = await response.json();

        if (!response.ok || !slipResult.success) {
          return new Response(JSON.stringify({ 
            error: slipResult.message || "การตรวจสอบสลิปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" 
          }), {
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            }
          });
        }

        const slipData = slipResult.data;
        if (!slipData || !slipData.success) {
          return new Response(JSON.stringify({ 
            error: slipData.message || "ข้อมูลสลิปไม่ถูกต้อง" 
          }), {
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            }
          });
        }

        // Verify transaction reference to prevent double submission
        transRef = slipData.transRef;
        if (!transRef) {
          return new Response(JSON.stringify({ error: "ไม่พบรหัสอ้างอิงธุรกรรมในสลิป" }), {
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            }
          });
        }

        const isUsedRef = await DONATION_STORE.get(`ref_${transRef}`);
        if (isUsedRef) {
          return new Response(JSON.stringify({ error: "สลิปนี้ถูกใช้ไปแล้วในการร่วมทำบุญก่อนหน้านี้" }), {
            status: 400,
            headers: { 
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*" 
            }
          });
        }

        donationAmount = parseFloat(slipData.amount);
        isVerified = true;
      }
    } else {
      // 2. Direct payment simulation (no QR code uploaded)
      donationAmount = parseFloat(amount);
      if (isNaN(donationAmount) || donationAmount <= 0) {
        return new Response(JSON.stringify({ error: "ยอดเงินไม่ถูกต้อง" }), {
          status: 400,
          headers: { 
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*" 
          }
        });
      }
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

    // Record reference if verified to prevent duplicate use
    if (transRef) {
      await DONATION_STORE.put(`ref_${transRef}`, "used");
    }

    return new Response(JSON.stringify({ 
      success: true, 
      currentAmount, 
      totalDonors,
      isVerified,
      actualAmount: donationAmount,
      warning
    }), {
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
