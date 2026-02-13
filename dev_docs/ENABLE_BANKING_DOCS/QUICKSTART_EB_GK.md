Kickstart Open Banking and Enrichment in less than two hours
Get started quickly with connecting Open Banking, accessing raw account data, and creating financial insights.

Explore our docs
1
Enable Banking
Get started with accessing raw account data.

This documentation might not be fully up to date. You can view the latest information on Enable Bankings documentation page: https://enablebanking.com/docs/api/quick-start

1. Signing up for an account
Before you can begin using the Enable Banking API, you'll need to sign up for an account to Enable Banking Control Panel. Follow these steps.

1.1 Visit the authentication page here
1.2 Enter your email, new accounts are automatically created on the first sign in
1.3 Follow the one-time authentication link sent to your email. After authentication you will be redirected your profile in the Control
2. Registering an application
Once you have an account, you can register your application to obtain API access.

2.1 Go to the API applications page using the top menu of the Control Panel here
2.2 Fill out "Add a new application" form
2.2.1 Keep the Sandbox environment and the default option for creation of the application's private key
2.2.2 Fill in the name of your application (this name will be shown to end users when they will be requested to authorise sharing of their account information with your application or to confirm a payment initiated by your application)
2.2.3 Enter URLs whitelisted for redirecting of end users after they complete authorisation of access to account information or confirm a payment
2.3 Submit the form by pressing "Register" button. Your web browser will generate a private key for the application and it will be saved into your downloads folder. The file name will be the ID that was assigned to the newly registered application (e.g., aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pem)
3. Creating JWT for API authorisation
To authenticate with the API, your application will need to use JSON Web Tokens generated using the private key saved during the registration process described above. The full specification of the JWT format expected by Enable Banking API can be found in the API reference. Here is a sample implementation

3.1 Import a library allowing to generate JSON Web Tokens using RS256 algorithm
const jwa = require("jwa")
Most modern languages will have a number of libraries for JWT generation in their ecosystems. An extensive list of libraries for JWT generation can be found at https://jwt.io/libraries (opens new window).

3.2 Import other necessary libraries and write the necessary helper functions
const fs = require("fs")
const jsonBase64 = (data) => {
  return Buffer.from(JSON.stringify(data)).toString("base64").replace("=", "")
}
This part significantly varies depending on the programming language you choose and the library you use for JWT generation.

3.3 Read application's private key from a file
const privateKey = fs.readFileSync("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pem", "utf8")
Note that some libraries do not require you to load the private key from a file but rather allow you to pass the path to the file as a parameter.

3.4 Prepare the JWT payload (also known as the body)
const iat = Math.floor((new Date()).getTime() / 1000)
const jwtBody = {
  iss: "enablebanking.com", // always the same value
  aud: "api.enablebanking.com", // always the same value
  iat: iat, // time when the token is created
  exp: iat + 3600 // time when the token is set to expire
}
3.5 Create the JWT with its header and signature
const jwt = ((exp = 3600) => {
  const header = jsonBase64({
    typ: "JWT",
    alg: "RS256",
    kid: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" // your application's ID
  })
  const body = jsonBase64(jwtBody)
  const signature = jwa("RS256").sign((header + '.' + body), privateKey)
  return (header + '.' + body + '.' + signature)
})()
3.6 Prepare the authorisation header for sending with every API request
const baseHeaders = {
  Authorization: "Bearer " + jwt
}
Your application needs to send the above created authorisation header with every request it makes to Enable Banking API.

4. Accessing account information
With authentication in place, you can start accessing account information from ASPSPs (banks and similar financial institutions).

4.1 To obtain the list of available ASPSPs in a country, send a GET request to the ASPSPs endpoint specifying the desired country in the country query parameter in the format of Two-letter ISO 3166 code
const fetch = require('node-fetch');

const aspspsResponse = await fetch('https://api.enablebanking.com/aspsps?country=FI', {
  headers: baseHeaders
})
// If you want you can override BANK_NAME and BANK_COUNTRY with any bank from this list
console.log('Available ASPSPs: ' + await aspspsResponse.text())
4.2 The first step in obtaining account information is to start the authorisation process. To do this, send a POST request to the authorisation endpoint, specifying a bank name and a country from the list returned from ASPSPs endpoint
// 10 days ahead
const validUntil = new Date(new Date().getTime() + 10 * 24 * 60 * 60 * 1000);
const startAuthorizationBody = {
  access: {
    valid_until: validUntil.toISOString()
  },
  aspsp: {
    name: "Nordea", // BANK_NAME
    country: "FI" // BANK_COUNTRY
  },
  state: "123e4567-e89b-12d3-a456-426614174000",
  redirect_url: "https://example.com/redirect", // application's redirect URL
  psu_type: "personal"
}
const startAuthorizationResponse = await fetch('https://api.enablebanking.com/auth', {
  method: "POST",
  headers: baseHeaders,
  body: JSON.stringify(startAuthorizationBody)
})
const startAuthorizationData = await startAuthorizationResponse.text();
console.log('Start authorization data: ' + startAuthorizationData)
4.3 The response will contain a redirect URL to which you should redirect the end user to complete the authorisation process. After the end user completes the authorisation process, they will be redirected to the URL you specified during the application registration. The URL will contain a query parameter named code which will be used to authorize the user session
console.log('To authenticate open URL ' + startAuthorizationData)
4.4 To authorize the user session send a POST request to the sessions endpoint, specifying the code received in the authorisation endpoint. In the response you will receive a session ID, with the list of authorized accounts
const createSessionBody = {
  code: code
}
const createSessionResponse = await fetch('https://api.enablebanking.com/sessions', {
  method: "POST",
  headers: baseHeaders,
  body: JSON.stringify(createSessionBody)
})
const session = await createSessionResponse.text()
console.log('New user session has been created: ' + session)
4.5 To obtain the list of balances for the authorized accounts, send a GET request to the balances endpoint, specifying the account ID in the URL
// Using the first available account for the following API calls
const accountId = JSON.parse(session).accounts[0]
const accountBalancesResponse = await fetch('https://api.enablebanking.com/accounts/' + accountId + '/balances', {
  headers: baseHeaders
})
console.log('Account balances data: ' + accountBalancesResponse.text())
4.6 To obtain the list of balances for the authorized accounts, send a GET request to the balances endpoint, specifying the account ID in the URL
const accountTransactionsResponse = await fetch('https://api.enablebanking.com/accounts/' + accountId + '/transactions', {
  headers: baseHeaders
})
console.log('Account transactions data: ' + accountTransactionsResponse.text()')
2
Gokind
Create insights from the raw account data

1. Fetch an API key pair
Get your first API key pair.

1.1 Visit the portal here
1.2 Request a key pair and await verification
1.3 Once your key pair has been verified download it and store it safely
2. Get an access token
JWT valid for two hours.

const axios = require('axios');

const { token } = await axios.post('https://api.gokind.co/auth', {
  publicKey: "{YOUR_PUBLIC_KEY}",
  privateKey: "{YOUR_PRIVATE_KEY}"
})M
console.log('JWT token valid for two hours: ' + token);  
3. Format the Enable Banking data
Make it compatible with the Gokind API.

const formattedBundles = transactionFromEnableBanking.map(transaction => {
  const {
    remittance_information,
    creditor,
    debtor,
    bank_transaction_code,
    transaction_amount,
    value_date,
    booking_date,
    transaction_date,
  } = transaction;

  const {description, sub_code, code} = bank_transaction_code;
  const {amount, currency} = transaction_amount;

  return {
    label: remittance_information.join(' '),
    creditor: creditor.name,
    debtor: debtor.name,
    type: description || code,
    subType: sub_code,
    amount: amount,
    currency: currency,
    date: value_date || booking_date || transaction_date
  }
});
console.log('Formatted bundles: ' + JSON.stringify(formattedBundles));
4. Get the enriched response
Enrich the formatted bundles.

const axios = require('axios');

const headers = {
  'Authorization': 'Bearer ' + token
};

const body = {
  identifiers:{
    account:{
      type: "business",
    },
    bundles: formattedBundles
  },
  include:{
    logo: true,
    industries: true,
    payment: true,
    checks: true,
    flags: true,
    event: true,
  },
  config:{
    region: "SE",
    return: {
        unidentified: true
    }
  }   
};

const response = await axios.post('https://api.gokind.co/identify', body, { headers });
console.log(response);