API reference
Scroll down for example requests and responses.

Base URLs:

https://api.enablebanking.com

https://api.tilisy.com (deprecated)

Flow diagrams
Account information flow
AIS flow diagram

Application (i.e. API client) makes GET /aspsps request to obtain a list of available ASPSPs along with necessary meta data. Alternatively, the list of ASPSP can be displayed using the ASPSP selection UI widget.

List of available ASPSPs is returned and displayed to a PSU.

The PSU selects desired ASPSP and an application makes POST /auth request, specifying desired ASPSP and providing information about needed access rights.

Enable Banking starts authorisation in a desired ASPSP.

Enable Banking responds to the client with a redirect url to a Enable Banking page, where PSU needs to be redirected.

The PSU is redirected to the Enable Banking page.

After the PSU is redirected, Enable Banking does interactions with an ASPSP necessary to get authorised access to the PSU's account.

These actions are ASPSP-specific and may be different depending of the authentication method (which may be specified at step 3).

The PSU is redirected to the callback URL provided by the application with additional parameters added in its query string.

If the authorisation went successfully then query string from step 8 will contain code parameter, which needs to be sent in POST /sessions request.

The Enable Banking API will respond with created session_id along with a list of accessible accounts and their details.

Note that some of the information returned in that call is shown only once.

After successfull response to POST /sessions request the application can start making requests to Enable Banking API to fetch information about session, account balances and transactions.

Possible query parameters returned in the step 8 (parameters follow The OAuth 2.0 Authorization Framework (opens new window)):

code — authorisation code.
state — same as state, provided in the step 1.
error — error code
error_description — human-readable error description
Possible error descriptions:

Denied data sharing consent — user cancelled authentication before accepting data sharing consent (error code is access_denied)
Cancelled by user — user cancelled authorisation of access to account information (error code is access_denied). There are also arbitrary error descriptions possible, which are coming from ASPSPs.
Payment initiation flow
PIS flow diagram

Application (i.e. API client) makes GET /aspsps request to obtain a list of available ASPSPs along with necessary meta data. Alternatively, the list of ASPSP can be displayed using the ASPSP selection UI widget.

List of available ASPSPs is returned and displayed to a PSU.

The PSU selects desired ASPSP and the application makes POST /payments request, specifying a desired ASPSP, providing details for the payment to be initiated and other details such as callback URL, preferred authentication method, etc.

Enable Banking responds to the application with an ID assigned to the payment and a URL of the page, where PSU needs to be redirected.

The PSU is redirected to the Enable Banking page, where they shall review payment details and terms of the service.

After the PSU accepted term of service, Enable Banking does interactions with the ASPSP necessary to initiate the payment and complete its authorisation.

These actions are ASPSP-specific and may be different depending of the authentication method (which may be specified at step 3).

The PSU is redirected to the callback URL provided by the application with additional parameters added in its query string.

Possible query parameters returned in the step 7:

state — same as state, provided in the step 1.
error — error code
error_description — human-readable error description
Possible error descriptions:

Cancelled by user — user cancelled authorisation of the payment (error code is access_denied). There are also arbitrary error descriptions possible, which are coming from ASPSPs.
Authentication
In order to get access to this API you need to:

Generate a private RSA key and a self-signed certificate;
Upload the certificate to enablebanking.com and get application ID;
Construct JWT with the data described below and signed with your private key;
Send the JWT in the Authorization header.
Private key and certificate generation
Generating private RSA key

openssl genrsa -out private.key 4096
OpenSSL CLI can be used for generation of a private key and self-signed certificate.

Make sure you keep the private key in secret (e.g. don't expose it to client, share with anyone nor embed into mobile or other apps intalled to user devices).

Generating self-signed certificate

openssl req -new -x509 -days 365 -key private.key -out public.crt -subj "/C=FI/ST=Uusima/L=Helsinki/O=ExampleOrganisation/CN=www.bigorg.com"
You should replace values under -subj with appropriate values.

Alternatively you can use the private key generated in your browser when registering a new application. Just choose Generate in the browser (using SubtleCrypto) and export private key option when registering an application, and the private key will be exported after the application has been registered (the corresponding certificate will be used for the app registration).

Certificate upload and application registration
To register a new application you need to have an account on the Enable Banking Control Panel (opens new window). You can create one by visiting https://enablebanking.com/sign-in/ (opens new window)and entering your email address (a one-time authentication link will be sent to your email address).

In the app registration form (opens new window)you will be asked to upload the public certificate that you created for the application being registered.

An application can be registered to either PRODUCTION (aka "live") or SANDBOX (aka "simulation") environment. Applications can not be transferred from the sandbox to the production environment and vice versa.

Applications registered into the sandbox environment are activated automatically. Applications registered to the production environment at first appear as pending and will be activated either after contractual formalities for the use of the API are cleared or after you whitelist your own accounts. For more information please contact us at info@enablebanking.com.

Application registration API
You can also register an application sending POST request containing JSON with the application details and public certificate to https://enablebanking.com/api/applications endpoint.

The JSON body for the endpoint is to include the following fields:

"certificate": Content of the certificate or public key of the application (always required)
"environment": Environment (SANDBOX or PRODUCTION) in which the application will operate (always required)
"name": Name of the application being registered (always required)
"redirect_urls": List of allowed redirect URLs for the application (always required)
"description": Description of the application being registered (required when the environment field is set to PRODUCTION)
"gdpr_email": Email address for data protection matters (required when the environment field is set to PRODUCTION)
"privacy_url": URL of the application's privacy policy (required when the environment field is set to PRODUCTION)
"terms_url": URL of the application's terms of service (required when the environment field is set to PRODUCTION)
App registration example using curl

curl -X POST -H "Authorization: Bearer YOUR-JWT-ON-ENABLEBANKING-COM" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"My app\",\"certificate\":\"$(cat public.crt | tr '\n' '|' | sed 's/|/\\n/g')\",\"environment\":\"SANDBOX\",\"redirect_urls\":[\"https://example.org/\"]}" \
  https://enablebanking.com/api/applications
In response to the app registration request, you will receive an ID assigned to your application, which is to be used when forming JTW token.

Example response

{
  "app_id": "cf589be3-3755-465b-a8df-a90a16a31403"
}
JWT format and signature
JWT example

eyJ0eXAiOiAiSldUIiwgImFsZyI6ICJSUzI1NiIsICJraWQiOiAiY2Y1ODliZTMtMzc1NS00NjViLWE4ZGYtYTkwYTE2YTMxNDAzIn0.eyJpc3MiOiAiZW5hYmxlYmFua2luZy5jb20iLCAiYXVkIjogImFwaS50aWxpc3kuY29tIiwgImlhdCI6IDE2MDE0NTY3NjgsICJleHAiOiAxNjAxNTQzMTY4fQ.daO3ENSYIA3ud7Ay7uGQ0xxqq9r4_WLcM5SbrN_6_fqsFZXFdoGQA5nKiyP8Ot4nWdYcZvaNWxEAOIodUFndOP8pjihF9-rMXuNGEjde1cq2WjYzKwiIeodUej8okDWdB--szcgurzGMd8RRMjqr951PWqnXS-PbrRsavDHp8l2q4YBjh2m80nRruKnQCAn0dtm4A5G9rZaEowo9z-c8HJU101jKddyOpHhl9UvxVrERzHtyO4LdidiP4rP1hmaVMWybSbcIMI_h30qjqWP21kYRH9ENITTttbf0uZIa8s74jKYxNIdiiDyRaq9WjoPolrHI_ZxcMjp8mmCKX-N-1w
You can read more about JWT here: https://jwt.io/introduction/

JWT header must contain following fields:

"typ": "JWT" (always the same)
"alg": "RS256" (always the same, only RS256 is supported)
"kid": "<application_id>" (application id obtained after certificate upload)
JWT body must contain following fields:

"iss": "enablebanking.com" (always the same)
"aud": "api.enablebanking.com" (always the same, formerly had to be "api.tilisy.com", which is now deprecated)
"iat": 1601456603 (timestamp when the token is being created)
"exp": 1601460262 (timestamp when the token expires)
Maximum allowed time-to-live for token is 86400 seconds (24 hours). Tokens created with longer TTL are not accepted by the API.

Check code samples in C#, Node.js, PHP, Python and Ruby in our GitHub repository(opens new window)

https://github.com/enablebanking/enablebanking-api-samples
Send request with JWT provided
Example request

GET https://api.enablebanking.com/application HTTP/1.1
Host: api.enablebanking.com
Authorization: Bearer eyJ0eXAiOiAiSldUIiwgImFsZyI6ICJSUzI1NiIsICJraWQiOiAiY2Y1ODliZTMtMzc1NS00NjViLWE4ZGYtYTkwYTE2YTMxNDAzIn0.eyJpc3MiOiAiZW5hYmxlYmFua2luZy5jb20iLCAiYXVkIjogImFwaS5lbmFibGViYW5raW5nLmNvbSIsICJpYXQiOiAxNjAxNDU2NzY4LCAiZXhwIjogMTYwMTU0MzE2OH0.daO3ENSYIA3ud7Ay7uGQ0xxqq9r4_WLcM5SbrN_6_fqsFZXFdoGQA5nKiyP8Ot4nWdYcZvaNWxEAOIodUFndOP8pjihF9-rMXuNGEjde1cq2WjYzKwiIeodUej8okDWdB--szcgurzGMd8RRMjqr951PWqnXS-PbrRsavDHp8l2q4YBjh2m80nRruKnQCAn0dtm4A5G9rZaEowo9z-c8HJU101jKddyOpHhl9UvxVrERzHtyO4LdidiP4rP1hmaVMWybSbcIMI_h30qjqWP21kYRH9ENITTttbf0uZIa8s74jKYxNIdiiDyRaq9WjoPolrHI_ZxcMjp8mmCKX-N-1w
In order to authenticate your application, you need to provide JWT in the "Authorization" header of your request.

User sessions
The following operations can be used to initiate and complete end-user authorization for access to account information. The other operations provide possibility to retrieve session status and other details and to close (delete) a session.

Start user authorization

POST /auth

Start authorization by getting a redirect link and redirecting a PSU to that link

Parameters
Name	In	Type	Required	Description
body	body	StartAuthorizationRequest	true	none
Authentication

To perform this operation, API requests must include Authorization header containing JWT calculated using private RSA key of the client application making the request. See jwtAuthentication.

Example request

POST https://api.enablebanking.com/auth HTTP/1.1
Host: api.enablebanking.com
Content-Type: application/json
Accept: application/json
Authorization: Bearer <JWT>

Request body

{
  "access": {
    "valid_until": "2019-08-24T14:15:22Z"
  },
  "aspsp": {
    "name": "Nordea",
    "country": "FI"
  },
  "state": "3a57e2d3-2e0c-4336-af9b-7fa94f0606a3",
  "redirect_url": "http://example.com",
  "psu_type": "business",
  "auth_method": "methodName",
  "credentials": {
    "userId": "MyUsername"
  },
  "credentials_autosubmit": true,
  "language": "fi",
  "psu_id": "string"
}
Responses
Status	Description	Schema
200	Successful Response	StartAuthorizationResponse
400	Bad Request	ErrorResponse
401	Unauthorized	ErrorResponse
403	Forbidden	ErrorResponse
404	Not Found	ErrorResponse
408	Request Timeout	ErrorResponse
422	Unprocessable Entity	ErrorResponse
429	Too Many Requests	ErrorResponse
500	Internal Server Error	ErrorResponse
Example responses

200 Response

{
  "url": "https://tilisy.enablebanking.com/welcome?sessionid=73100c65-c54d-46a1-87d1-aa3effde435a",
  "authorization_id": "73100c65-c54d-46a1-87d1-aa3effde435a",
  "psu_id_hash": "string"
}
Authorize user session

POST /sessions

Authorize user session by provided authorization code

Parameters
Name	In	Type	Required	Description
body	body	AuthorizeSessionRequest	true	none
Authentication

To perform this operation, API requests must include Authorization header containing JWT calculated using private RSA key of the client application making the request. See jwtAuthentication.

Example request

POST https://api.enablebanking.com/sessions HTTP/1.1
Host: api.enablebanking.com
Content-Type: application/json
Accept: application/json
Authorization: Bearer <JWT>

Request body

{
  "code": "string"
}
Responses
Status	Description	Schema
200	Successful Response	AuthorizeSessionResponse
400	Bad Request	ErrorResponse
401	Unauthorized	ErrorResponse
403	Forbidden	ErrorResponse
404	Not Found	ErrorResponse
408	Request Timeout	ErrorResponse
422	Unprocessable Entity	ErrorResponse
429	Too Many Requests	ErrorResponse
500	Internal Server Error	ErrorResponse
Example responses

200 Response

{
  "session_id": "string",
  "accounts": [
    {
      "account_id": {
        "iban": "FI0455231152453547"
      },
      "all_account_ids": [
        {
          "identification": "123456",
          "scheme_name": "BBAN"
        }
      ],
      "account_servicer": {
        "bic_fi": "string",
        "clearing_system_member_id": {
          "clearing_system_id": "NZNCC",
          "member_id": 20368
        },
        "name": "string"
      },
      "name": "string",
      "details": "string",
      "usage": "PRIV",
      "cash_account_type": "CACC",
      "product": "string",
      "currency": "string",
      "psu_status": "string",
      "credit_limit": {
        "currency": "EUR",
        "amount": "1.23"
      },
      "legal_age": true,
      "postal_address": {
        "address_type": "Business",
        "department": "Department of resources",
        "sub_department": "Sub Department of resources",
        "street_name": "Vasavagen",
        "building_number": "4",
        "post_code": "00123",
        "town_name": "Helsinki",
        "country_sub_division": "Uusimaa",
        "country": "FI",
        "address_line": [
          "Mr Asko Teirila PO Box 511",
          "39140 AKDENMAA FINLAND"
        ]
      },
      "uid": "07cc67f4-45d6-494b-adac-09b5cbc7e2b5",
      "identification_hash": "WwpbCiJhY2NvdW50IiwKImFjY291bnRfaWQiLAoiaWJhbiIKXQpd.E8GzhnnsFC7K+4e3YMYYKpyM83Zx6toXrjgcvPP/Lqc=",
      "identification_hashes": [
        "WwpbCiJhY2NvdW50IiwKImFjY291bnRfaWQiLAoiaWJhbiIKXQpd.E8GzhnnsFC7K+4e3YMYYKpyM83Zx6toXrjgcvPP/Lqc=",
        "WwpbCiJhc3BzcF9uYW1lIgpdLApbCiJhc3BzcF9jb3VudHJ5IgpdLApbCiJhY2NvdW50IiwKImFjY291bnRfaWQiLAoib3RoZXIiLAoic2NoZW1lX25hbWUiCl0sClsKImFjY291bnQiLAoiYWNjb3VudF9pZCIsCiJvdGhlciIsCiJpZGVudGlmaWNhdGlvbiIKXQpd.AOm/TULGPD4a4GdcWhR9xh0GPlPUZuB2O1S9SYFWEz0="
      ]
    }
  ],
  "aspsp": {
    "name": "Nordea",
    "country": "FI"
  },
  "psu_type": "business",
  "access": {
    "valid_until": "2019-08-24T14:15:22Z"
  }
}
Get session data

GET /sessions/{session_id}

Get session data by session ID

Parameters
Name	In	Type	Required	Description
session_id	path	string(uuid)	true	Previously authorized session ID
Authentication

To perform this operation, API requests must include Authorization header containing JWT calculated using private RSA key of the client application making the request. See jwtAuthentication.

Example request

GET https://api.enablebanking.com/sessions/{session_id} HTTP/1.1
Host: api.enablebanking.com
Accept: application/json
Authorization: Bearer <JWT>

Responses
Status	Description	Schema
200	Successful Response	GetSessionResponse
400	Bad Request	ErrorResponse
401	Unauthorized	ErrorResponse
403	Forbidden	ErrorResponse
404	Not Found	ErrorResponse
408	Request Timeout	ErrorResponse
422	Unprocessable Entity	ErrorResponse
429	Too Many Requests	ErrorResponse
500	Internal Server Error	ErrorResponse
Example responses

200 Response

{
  "access": {
    "valid_until": "2020-12-01T12:00:00.000000+00:00"
  },
  "accounts": [
    "497f6eca-6276-4993-bfeb-53cbbbba6f08"
  ],
  "accounts_data": [
    {
      "identification_hash": "WwpbCiJhY2NvdW50IiwKImFjY291bnRfaWQiLAoiaWJhbiIKXQpd.E8GzhnnsFC7K+4e3YMYYKpyM83Zx6toXrjgcvPP/Lqc=",
      "uid": "497f6eca-6276-4993-bfeb-53cbbbba6f08"
    }
  ],
  "aspsp": {
    "country": "FI",
    "name": "Nordea"
  },
  "authorized": "2020-12-01T12:00:00.000000+00:00",
  "created": "2020-12-01T12:00:00.000000+00:00",
  "psu_type": "business",
  "status": "AUTHORIZED"
}
Delete session

DELETE /sessions/{session_id}

Delete session by session ID. PSU's bank consent will be closed automatically if possible

Parameters
Name	In	Type	Required	Description
session_id	path	string(uuid)	true	Previously authorized session ID
Psu-Ip-Address	header	string	false	PSU IP address
Psu-User-Agent	header	string	false	PSU browser User Agent
Psu-Referer	header	string	false	PSU Referer
Psu-Accept	header	string	false	PSU accept header
Psu-Accept-Charset	header	string	false	PSU charset
Psu-Accept-Encoding	header	string	false	PSU accept encoding
Psu-Accept-language	header	string	false	PSU accept language
Psu-Geo-Location	header	string	false	Comma separated latitude and longitude coordinates without spaces
Authentication

To perform this operation, API requests must include Authorization header containing JWT calculated using private RSA key of the client application making the request. See jwtAuthentication.

Example request

DELETE https://api.enablebanking.com/sessions/{session_id} HTTP/1.1
Host: api.enablebanking.com
Accept: application/json
Psu-Ip-Address: string
Psu-User-Agent: string
Psu-Referer: string
Psu-Accept: string
Psu-Accept-Charset: string
Psu-Accept-Encoding: string
Psu-Accept-language: string
Psu-Geo-Location: -1.2345,6.789
Authorization: Bearer <JWT>

Responses
Status	Description	Schema
200	Successful Response	SuccessResponse
400	Bad Request	ErrorResponse
401	Unauthorized	ErrorResponse
403	Forbidden	ErrorResponse
404	Not Found	ErrorResponse
408	Request Timeout	ErrorResponse
422	Unprocessable Entity	ErrorResponse
429	Too Many Requests	ErrorResponse
500	Internal Server Error	ErrorResponse
Example responses

200 Response

{
  "message": "OK"
}
Accounts data
Get account details

GET /accounts/{account_id}/details

Fetching account details from ASPSP for an account by its ID

Parameters
Name	In	Type	Required	Description
account_id	path	string(uuid)	true	Account ID
Psu-Ip-Address	header	string	false	PSU IP address
Psu-User-Agent	header	string	false	PSU browser User Agent
Psu-Referer	header	string	false	PSU Referer
Psu-Accept	header	string	false	PSU accept header
Psu-Accept-Charset	header	string	false	PSU charset
Psu-Accept-Encoding	header	string	false	PSU accept encoding
Psu-Accept-language	header	string	false	PSU accept language
Psu-Geo-Location	header	string	false	Comma separated latitude and longitude coordinates without spaces
Authentication

To perform this operation, API requests must include Authorization header containing JWT calculated using private RSA key of the client application making the request. See jwtAuthentication.

Example request

GET https://api.enablebanking.com/accounts/{account_id}/details HTTP/1.1
Host: api.enablebanking.com
Accept: application/json
Psu-Ip-Address: string
Psu-User-Agent: string
Psu-Referer: string
Psu-Accept: string
Psu-Accept-Charset: string
Psu-Accept-Encoding: string
Psu-Accept-language: string
Psu-Geo-Location: -1.2345,6.789
Authorization: Bearer <JWT>

Responses
Status	Description	Schema
200	Successful Response	AccountResource
400	Bad Request	ErrorResponse
401	Unauthorized	ErrorResponse
403	Forbidden	ErrorResponse
404	Not Found	ErrorResponse
408	Request Timeout	ErrorResponse
422	Unprocessable Entity	ErrorResponse
429	Too Many Requests	ErrorResponse
500	Internal Server Error	ErrorResponse
Example responses

200 Response

{
  "account_id": {
    "iban": "FI0455231152453547"
  },
  "all_account_ids": [
    {
      "identification": "123456",
      "scheme_name": "BBAN"
    }
  ],
  "account_servicer": {
    "bic_fi": "string",
    "clearing_system_member_id": {
      "clearing_system_id": "NZNCC",
      "member_id": 20368
    },
    "name": "string"
  },
  "name": "string",
  "details": "string",
  "usage": "PRIV",
  "cash_account_type": "CACC",
  "product": "string",
  "currency": "string",
  "psu_status": "string",
  "credit_limit": {
    "currency": "EUR",
    "amount": "1.23"
  },
  "legal_age": true,
  "postal_address": {
    "address_type": "Business",
    "department": "Department of resources",
    "sub_department": "Sub Department of resources",
    "street_name": "Vasavagen",
    "building_number": "4",
    "post_code": "00123",
    "town_name": "Helsinki",
    "country_sub_division": "Uusimaa",
    "country": "FI",
    "address_line": [
      "Mr Asko Teirila PO Box 511",
      "39140 AKDENMAA FINLAND"
    ]
  },
  "uid": "07cc67f4-45d6-494b-adac-09b5cbc7e2b5",
  "identification_hash": "WwpbCiJhY2NvdW50IiwKImFjY291bnRfaWQiLAoiaWJhbiIKXQpd.E8GzhnnsFC7K+4e3YMYYKpyM83Zx6toXrjgcvPP/Lqc=",
  "identification_hashes": [
    "WwpbCiJhY2NvdW50IiwKImFjY291bnRfaWQiLAoiaWJhbiIKXQpd.E8GzhnnsFC7K+4e3YMYYKpyM83Zx6toXrjgcvPP/Lqc=",
    "WwpbCiJhc3BzcF9uYW1lIgpdLApbCiJhc3BzcF9jb3VudHJ5IgpdLApbCiJhY2NvdW50IiwKImFjY291bnRfaWQiLAoib3RoZXIiLAoic2NoZW1lX25hbWUiCl0sClsKImFjY291bnQiLAoiYWNjb3VudF9pZCIsCiJvdGhlciIsCiJpZGVudGlmaWNhdGlvbiIKXQpd.AOm/TULGPD4a4GdcWhR9xh0GPlPUZuB2O1S9SYFWEz0="
  ]
}
Get account balances

GET /accounts/{account_id}/balances

Fetching account balances from ASPSP for an account by its ID

Parameters
Name	In	Type	Required	Description
account_id	path	string(uuid)	true	PSU account ID accessible in the provided session
Psu-Ip-Address	header	string	false	PSU IP address
Psu-User-Agent	header	string	false	PSU browser User Agent
Psu-Referer	header	string	false	PSU Referer
Psu-Accept	header	string	false	PSU accept header
Psu-Accept-Charset	header	string	false	PSU charset
Psu-Accept-Encoding	header	string	false	PSU accept encoding
Psu-Accept-language	header	string	false	PSU accept language
Psu-Geo-Location	header	string	false	Comma separated latitude and longitude coordinates without spaces
Authentication

To perform this operation, API requests must include Authorization header containing JWT calculated using private RSA key of the client application making the request. See jwtAuthentication.

Example request

GET https://api.enablebanking.com/accounts/{account_id}/balances HTTP/1.1
Host: api.enablebanking.com
Accept: application/json
Psu-Ip-Address: string
Psu-User-Agent: string
Psu-Referer: string
Psu-Accept: string
Psu-Accept-Charset: string
Psu-Accept-Encoding: string
Psu-Accept-language: string
Psu-Geo-Location: -1.2345,6.789
Authorization: Bearer <JWT>

Responses
Status	Description	Schema
200	Successful Response	HalBalances
400	Bad Request	ErrorResponse
401	Unauthorized	ErrorResponse
403	Forbidden	ErrorResponse
404	Not Found	ErrorResponse
408	Request Timeout	ErrorResponse
422	Unprocessable Entity	ErrorResponse
429	Too Many Requests	ErrorResponse
500	Internal Server Error	ErrorResponse
Example responses

200 Response

{
  "balances": [
    {
      "name": "Booked balance",
      "balance_amount": {
        "currency": "EUR",
        "amount": "1.23"
      },
      "balance_type": "CLAV",
      "last_change_date_time": "2019-08-24T14:15:22Z",
      "reference_date": "2019-08-24",
      "last_committed_transaction": "4604aa90f8a8418092d80c3270846f0a"
    }
  ]
}
Get account transactions

GET /accounts/{account_id}/transactions

Fetching account transactions from ASPSP for an account by its ID

Parameters
Name	In	Type	Required	Description
account_id	path	string(uuid)	true	PSU account ID accessible in the provided session
date_from	query	string(date)	false	Date to fetch transactions from (including the date, UTC timezone is assumed)
date_to	query	string(date)	false	Date to fetch transactions to (including the date, UTC timezone is assumed)
continuation_key	query	string	false	Key, allowing iterate over multiple API pages of transactions
transaction_status	query	TransactionStatus	false	Filter transactions by provided status
strategy	query	TransactionsFetchStrategy	false	Strategy how transaction are fetched
Psu-Ip-Address	header	string	false	PSU IP address
Psu-User-Agent	header	string	false	PSU browser User Agent
Psu-Referer	header	string	false	PSU Referer
Psu-Accept	header	string	false	PSU accept header
Psu-Accept-Charset	header	string	false	PSU charset
Psu-Accept-Encoding	header	string	false	PSU accept encoding
Psu-Accept-language	header	string	false	PSU accept language
Psu-Geo-Location	header	string	false	Comma separated latitude and longitude coordinates without spaces
Authentication

To perform this operation, API requests must include Authorization header containing JWT calculated using private RSA key of the client application making the request. See jwtAuthentication.

Example request

GET https://api.enablebanking.com/accounts/{account_id}/transactions HTTP/1.1
Host: api.enablebanking.com
Accept: application/json
Psu-Ip-Address: string
Psu-User-Agent: string
Psu-Referer: string
Psu-Accept: string
Psu-Accept-Charset: string
Psu-Accept-Encoding: string
Psu-Accept-language: string
Psu-Geo-Location: -1.2345,6.789
Authorization: Bearer <JWT>

Responses
Status	Description	Schema
200	Successful Response	HalTransactions
400	Bad Request	ErrorResponse
401	Unauthorized	ErrorResponse
403	Forbidden	ErrorResponse
404	Not Found	ErrorResponse
408	Request Timeout	ErrorResponse
422	Unprocessable Entity	ErrorResponse
429	Too Many Requests	ErrorResponse
500	Internal Server Error	ErrorResponse
Example responses

200 Response

{
  "transactions": [
    {
      "entry_reference": "5561990681",
      "merchant_category_code": "5511",
      "transaction_amount": {
        "currency": "EUR",
        "amount": "1.23"
      },
      "creditor": {
        "name": "MyPreferredAisp",
        "postal_address": {
          "address_line": [
            "Mr Asko Teirila PO Box 511",
            "39140 AKDENMAA FINLAND"
          ],
          "address_type": "Business",
          "building_number": "4",
          "country": "FI",
          "country_sub_division": "Uusimaa",
          "department": "Department of resources",
          "post_code": "00123",
          "street_name": "Vasavagen",
          "sub_department": "Sub Department of resources",
          "town_name": "Helsinki"
        }
      },
      "creditor_account": {
        "iban": "FI0455231152453547"
      },
      "creditor_agent": {
        "bic_fi": "string",
        "clearing_system_member_id": {
          "clearing_system_id": "NZNCC",
          "member_id": 20368
        },
        "name": "string"
      },
      "debtor": {
        "name": "MyPreferredAisp",
        "postal_address": {
          "address_line": [
            "Mr Asko Teirila PO Box 511",
            "39140 AKDENMAA FINLAND"
          ],
          "address_type": "Business",
          "building_number": "4",
          "country": "FI",
          "country_sub_division": "Uusimaa",
          "department": "Department of resources",
          "post_code": "00123",
          "street_name": "Vasavagen",
          "sub_department": "Sub Department of resources",
          "town_name": "Helsinki"
        }
      },
      "debtor_account": {
        "iban": "FI0455231152453547"
      },
      "debtor_agent": {
        "bic_fi": "string",
        "clearing_system_member_id": {
          "clearing_system_id": "NZNCC",
          "member_id": 20368
        },
        "name": "string"
      },
      "bank_transaction_code": {
        "description": "Utlandsbetalning",
        "code": "12",
        "sub_code": "32"
      },
      "credit_debit_indicator": "CRDT",
      "status": "BOOK",
      "booking_date": "2020-01-03",
      "value_date": "2020-01-02",
      "transaction_date": "2020-01-01",
      "balance_after_transaction": {
        "currency": "EUR",
        "amount": "1.23"
      },
      "reference_number": "RF07850352502356628678117",
      "reference_number_schema": "SEBG",
      "remittance_information": [
        "RF07850352502356628678117",
        "Gift for Alex"
      ],
      "debtor_account_additional_identification": {
        "identification": "12345678",
        "scheme_name": "CPAN"
      },
      "creditor_account_additional_identification": {
        "identification": "12345678",
        "scheme_name": "BBAN"
      },
      "exchange_rate": {
        "unit_currency": "EUR",
        "exchange_rate": "string",
        "rate_type": "SPOT",
        "contract_identification": "string",
        "instructed_amount": {
          "currency": "EUR",
          "amount": "1.23"
        }
      },
      "note": "string",
      "transaction_id": "string"
    }
  ],
  "continuation_key": "string"
}
Get transaction details

GET /accounts/{account_id}/transactions/{transaction_id}

Fetching transaction details from ASPSP for an account transaction by its ID

Parameters
Name	In	Type	Required	Description
account_id	path	string(uuid)	true	Account ID
transaction_id	path	string	true	Transaction ID
Psu-Ip-Address	header	string	false	PSU IP address
Psu-User-Agent	header	string	false	PSU browser User Agent
Psu-Referer	header	string	false	PSU Referer
Psu-Accept	header	string	false	PSU accept header
Psu-Accept-Charset	header	string	false	PSU charset
Psu-Accept-Encoding	header	string	false	PSU accept encoding
Psu-Accept-language	header	string	false	PSU accept language
Psu-Geo-Location	header	string	false	Comma separated latitude and longitude coordinates without spaces
Authentication

To perform this operation, API requests must include Authorization header containing JWT calculated using private RSA key of the client application making the request. See jwtAuthentication.

Example request

GET https://api.enablebanking.com/accounts/{account_id}/transactions/{transaction_id} HTTP/1.1
Host: api.enablebanking.com
Accept: application/json
Psu-Ip-Address: string
Psu-User-Agent: string
Psu-Referer: string
Psu-Accept: string
Psu-Accept-Charset: string
Psu-Accept-Encoding: string
Psu-Accept-language: string
Psu-Geo-Location: -1.2345,6.789
Authorization: Bearer <JWT>

Responses
Status	Description	Schema
200	Successful Response	Transaction
400	Bad Request	ErrorResponse
401	Unauthorized	ErrorResponse
403	Forbidden	ErrorResponse
404	Not Found	ErrorResponse
408	Request Timeout	ErrorResponse
422	Unprocessable Entity	ErrorResponse
429	Too Many Requests	ErrorResponse
500	Internal Server Error	ErrorResponse
Example responses

200 Response

{
  "entry_reference": "5561990681",
  "merchant_category_code": "5511",
  "transaction_amount": {
    "currency": "EUR",
    "amount": "1.23"
  },
  "creditor": {
    "name": "MyPreferredAisp",
    "postal_address": {
      "address_line": [
        "Mr Asko Teirila PO Box 511",
        "39140 AKDENMAA FINLAND"
      ],
      "address_type": "Business",
      "building_number": "4",
      "country": "FI",
      "country_sub_division": "Uusimaa",
      "department": "Department of resources",
      "post_code": "00123",
      "street_name": "Vasavagen",
      "sub_department": "Sub Department of resources",
      "town_name": "Helsinki"
    }
  },
  "creditor_account": {
    "iban": "FI0455231152453547"
  },
  "creditor_agent": {
    "bic_fi": "string",
    "clearing_system_member_id": {
      "clearing_system_id": "NZNCC",
      "member_id": 20368
    },
    "name": "string"
  },
  "debtor": {
    "name": "MyPreferredAisp",
    "postal_address": {
      "address_line": [
        "Mr Asko Teirila PO Box 511",
        "39140 AKDENMAA FINLAND"
      ],
      "address_type": "Business",
      "building_number": "4",
      "country": "FI",
      "country_sub_division": "Uusimaa",
      "department": "Department of resources",
      "post_code": "00123",
      "street_name": "Vasavagen",
      "sub_department": "Sub Department of resources",
      "town_name": "Helsinki"
    }
  },
  "debtor_account": {
    "iban": "FI0455231152453547"
  },
  "debtor_agent": {
    "bic_fi": "string",
    "clearing_system_member_id": {
      "clearing_system_id": "NZNCC",
      "member_id": 20368
    },
    "name": "string"
  },
  "bank_transaction_code": {
    "description": "Utlandsbetalning",
    "code": "12",
    "sub_code": "32"
  },
  "credit_debit_indicator": "CRDT",
  "status": "BOOK",
  "booking_date": "2020-01-03",
  "value_date": "2020-01-02",
  "transaction_date": "2020-01-01",
  "balance_after_transaction": {
    "currency": "EUR",
    "amount": "1.23"
  },
  "reference_number": "RF07850352502356628678117",
  "reference_number_schema": "SEBG",
  "remittance_information": [
    "RF07850352502356628678117",
    "Gift for Alex"
  ],
  "debtor_account_additional_identification": {
    "identification": "12345678",
    "scheme_name": "CPAN"
  },
  "creditor_account_additional_identification": {
    "identification": "12345678",
    "scheme_name": "BBAN"
  },
  "exchange_rate": {
    "unit_currency": "EUR",
    "exchange_rate": "string",
    "rate_type": "SPOT",
    "contract_identification": "string",
    "instructed_amount": {
      "currency": "EUR",
      "amount": "1.23"
    }
  },
  "note": "string",
  "transaction_id": "string"
}