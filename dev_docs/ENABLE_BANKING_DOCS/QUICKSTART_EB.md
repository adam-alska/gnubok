Quick Start with Enable Banking API
Welcome to the Quick Start guide for the Enable Banking API! This guide will help you quickly get up and running with the API so you can start building innovative financial applications.

Signing up for an account
Before you can begin using the Enable Banking API, you'll need to sign up for an account to Enable Banking Control Panel. Follow these steps:

Visit the authentication page https://enablebanking.com/sign-in/ (opens new window).
Enter your email, new accounts are automatically created on the first sign in.
Follow the one-time authentication link sent to your email. After authentication you will be redirected your profile in the Control.
Registering an application
Once you have an account, you can register your application to obtain API access:

Go to the API applications (opens new window)page using the top menu of the Control Panel.
Fill out "Add a new application" form:
Keep the Sandbox environment and the default option for creation of the application's private key;
Fill in the name of your application (this name will be shown to end users when they will be requested to authorise sharing of their account information with your application or to confirm a payment initiated by your application);
Enter URLs whitelisted for redirecting of end users after they complete authorisation of access to account information or confirm a payment.
Submit the form by pressing "Register" button. Your web browser will generate a private key for the application and it will be saved into your downloads folder. The file name will be the ID that was assigned to the newly registered application (e.g., aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pem).
Creating JWT for API authorisation
To authenticate with the API, your application will need to use JSON Web Tokens generated using the private key saved during the registration process described above. Here is a sample implementation:

Import a library allowing to generate JSON Web Tokens using RS256 algorithm:

PythonJavaScript
import jwt as pyjwt
Most modern languages will have a number of libraries for JWT generation in their ecosystems.

An extensive list of libraries for JWT generation can be found at https://jwt.io/libraries (opens new window).

Import other necessary libraries and write the necessary helper functions:

PythonJavaScript
import os
from datetime import datetime
This part significantly varies depending on the programming language you choose and the library you use for JWT generation.

Read application's private key from a file:

PythonJavaScript
private_key = open("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee.pem", "rb").read()
Note that some libraries do not require you to load the private key from a file but rather allow you to pass the path to the file as a parameter.

Prepare the JWT payload (also known as the body):

PythonJavaScript
iat = int(datetime.now().timestamp())
jwt_body = {
    "iss": "enablebanking.com", # always the same value
    "aud": "api.enablebanking.com", # always the same value
    "iat": iat, # time when the JSON Web Token is created
    "exp": iat + 3600, # time when the token is set to expire
}
Create the JWT with its header and signature:

PythonJavaScript
jwt = pyjwt.encode(
    jwt_body,
    private_key,
    algorithm="RS256",
    headers={
        "kid": "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee", # your application's ID
    }
)
Prepare the authorisation header for sending with every API request:

PythonJavaScript
base_headers = {
    "Authorization": f"Bearer {jwt}",
}
Your application needs to send the above created authorisation header with every request it makes to Enable Banking API.

The full specification of the JWT format expected by Enable Banking API can be found in the API reference.

Accessing account information
With authentication in place, you can start accessing account information from ASPSPs (banks and similar financial institutions):

To obtain the list of available ASPSPs in a country, send a GET request to the ASPSPs endpoint specifying the desired country in the country query parameter in the format of Two-letter ISO 3166 code:

PythonJavaScript
import requests
from pprint import pprint

r = requests.get("https://api.enablebanking.com/aspsps?country=FI", headers=base_headers)
# If you want you can override BANK_NAME and BANK_COUNTRY with any bank from this list
print("Available ASPSPs:")
pprint(r.json()["aspsps"])
The first step in obtaining account information is to start the authorisation process. To do this, send a POST request to the authorisation endpoint, specifying a bank name and a country from the list returned from ASPSPs endpoint.

PythonJavaScript
body = {
    "access": {
        "valid_until": (datetime.now(timezone.utc) + timedelta(days=10)).isoformat() # 10 days ahead
    },
    "aspsp": {
      "name": "Nordea", # BANK_NAME
      "country": "FI" # BANK_COUNTRY
    },
    "state": "123e4567-e89b-12d3-a456-426614174000"
    "redirect_url": "https://example.com/redirect", # application's redirect URL
    "psu_type": "personal",
}
r = requests.post("https://api.enablebanking.com/auth", json=body, headers=base_headers)
auth_url = r.json()["url"]
The response will contain a redirect URL to which you should redirect the end user to complete the authorisation process. After the end user completes the authorisation process, they will be redirected to the URL you specified during the application registration. The URL will contain a query parameter named code which will be used to authorize the user session

PythonJavaScript
 print(f"To authenticate open URL {auth_url}") # open this URL in a web browser
To authorize the user session send a POST request to the sessions endpoint, specifying the code received in the authorisation endpoint. In the response you will receive a session ID, with the list of authorized accounts.

PythonJavaScript
r = requests.post(f"https://api.enablebanking.com/sessions", json={"code": code}, headers=base_headers)
session = r.json()
print("New user session has been created:")
pprint(session)
To obtain the list of balances for the authorized accounts, send a GET request to the balances endpoint, specifying the account ID in the URL.

PythonJavaScript
  # Using the first available account for the following API calls
  account_uid = session["accounts"][0]["uid"]

  # Retrieving account balances
  r = requests.get(f"https://api.enablebanking.com/accounts/{account_uid}/balances", headers=base_headers)
  print("Balances:")
  pprint(r.json())
To obtain the list of transactions for the authorized accounts, send a GET request to the transactions endpoint, specifying the account ID in the URL.

PythonJavaScript
r = requests.get(f"https://api.enablebanking.com/accounts/{account_uid}/transactions",headers=base_headers)
resp_data = r.json()
print("Transactions:")
pprint(resp_data["transactions"])
you can refer to the API reference for more details on the API endpoints.

Full source code in our GitHub:

PythonJavaScript
https://github.com/enablebanking/enablebanking-api-samples/blob/master/python_example/account_information.py(opens new window)

Initiating payments
If your application requires payment initiation functionality, you can use the Enable Banking API for this purpose:

To initiate a payment, send a POST request to the Create Payment endpoint, specifying the payment details in the request body.

PythonJavaScript
  body = {
      "payment_type": "SEPA",
      "payment_request": {
          "credit_transfer_transaction": [
              {
                  "beneficiary": {
                      "creditor_account": {
                          "scheme_name": "IBAN",
                          "identification": "FI7473834510057469",
                      },
                      "creditor": {
                          "name": "Test",
                      },
                  },
                  "instructed_amount": {"amount": "2.00", "currency": "EUR"},
                  "reference_number": "123",
              }
          ],
      },
      "aspsp": {"name": "Nordea", "country": "FI"},
      "state": "123e4567-e89b-12d3-a456-426614174000",
      "redirect_url": "https://example.com/redirect", # application's redirect URL
      "psu_type": "personal",
  }
  r = requests.post(f"https://api.enablebanking.com/payments", json=body, headers=base_headers)
  payment = r.json()
The response will contain a redirect URL to which you should redirect the end user to complete the payment initiation process. Use following credentials to authenticate: customera / 12345678

PythonJavaScript
print("To authenticate open URL:")
print(payment["url"])
To get the status of the initiated payment, send a GET request to the Get Payment endpoint, specifying the payment ID in the URL.

PythonJavaScript
# This request can be called multiple times to check the status of the payment
payment_id = payment["payment_id"]
r = requests.get(f"https://api.enablebanking.com/payments/{payment_id}", headers=base_headers)
print("Payment status:")
pprint(r.json())
Full source code in our GitHub:

PythonJavaScript
https://github.com/enablebanking/enablebanking-api-samples/blob/master/python_example/payment_initiation.py(opens new window)

Next steps
Congratulations! You've completed the essential steps to get started with the Enable Banking API. Here are some suggested next steps:

Explore the API reference to learn more about the API endpoints and their parameters.
Check out code samples and a Postman collections in our GitHub repository (opens new window).
Discover the Control Panel where you can manage apps, configure settings, and monitor activity.
Learn how to test your API integrations in the Sandbox.
If you have any questions or run into issues, don't hesitate to reach out for assistance.

Happy coding!