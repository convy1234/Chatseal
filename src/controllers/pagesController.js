import fetch from "node-fetch";

export const getUserPages = async (req, res) => {
  try {
    const { user_token } = req.query;
    
    if (!user_token) {
      return res.status(400).json({ error: "User token required" });
    }

    const pagesRes = await fetch(`https://graph.facebook.com/v20.0/me/accounts?fields=id,name,access_token,picture,perms&access_token=${user_token}`);
    const pagesData = await pagesRes.json();

    if (pagesData.error) {
      return res.status(400).json({ error: pagesData.error.message });
    }

    res.json(pagesData.data);
  } catch (error) {
    console.error("Get pages error:", error);
    res.status(500).json({ error: "Failed to fetch pages" });
  }
};