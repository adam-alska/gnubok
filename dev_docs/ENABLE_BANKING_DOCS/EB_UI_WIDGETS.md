UI Widgets
Terms consent
This widget provides the possibility to display to an end user terms of the service and acquire their consent before redirecting them to tilisy.enablebanking.com for authorisation of the requested access in an ASPSP.

NB

The widget shall be used only when your application relies on Enable Banking accessing ASPSPs as a regulated entity. If your company is a licensed TPP and Enable Banking acts solely as a technical service provider, the terms of service step is always skipped during the authorisation flow.

In order to use the widget, the following is needed.

Load the widgets library https://tilisy.enablebanking.com/lib/widgets.umd.min.js on the page where it is going to be used.
<script src="https://tilisy.enablebanking.com/lib/widgets.umd.min.js"></script>
Put the custom element enablebanking-consent registered by the widgets library into the place on the page where the widget needs to be shown.
<enablebanking-consent
  id="enablebanking-consent"
  authorization="a8bfe9f4-dfdf-4c86-9a94-9db7660bd4bd"
  locale="SV"
  can-cancel
  sandbox></enablebanking-consent>
The element enablebanking-consent has the following attributes:

authorization (required), should contain authorisation ID received from POST /auth API call;
locale (optional), language in which the widget content should be presented. Supported languages: DA, EN, ET, FI, FR, LT, LV, NL, NO, PL, RU, SV;
can-cancel (optional), when present the “Cancel” button will be displayed, which will emit cancel event when pressed;
sandbox (optional), to be used when authorisation was initiated with an application registered to sandbox environment;
origin (optional), to be provided in case a custom/dedicated environment is used, the default value is https://tilisy.enablebanking.com;
no-redirect (optional), to be used if the end user should not be automatically redirected to tilisy.enablebanking.com for authorisation of the access in an ASPSP; in this case redirect is to be performed when confirmed event is triggered.
Using event listener function

<script>
  document.getElementById("enablebanking-consent").addEventListener("confirmed", function(e) {
    console.log(e)
  });
</script>
The element produces the following events:

error, if an error occurs,
ready, when the widget is fully loaded,
confirmed, after a user has confirmed the consent,
cancelled, if the “Cancel” button was pressed.
The events can be listened similarly to standard Javascript events using addEventListener method called for the enablebanking-consent element.

The widget does not include any CSS, it will use the styles present on the page where included.

NB

The widget can be used only on the websites with origins whitelisted for the application used to initiate end user authorisation.

Whitelisting of the origins can be done through the control panel:

Go to https://enablebanking.com/cp/applications (opens new window);
Choose Edit from the context menu for your application ("⋮" next to the application name);
Enter necessary origins into the "Allowed widget origins" edit box;
Press the "Save" button.
ASPSP selection
This widget provides a method to present on a web page the list of available ASPSPs (i.e. banks and similar financial institutions) and let an end-user to select the one, which they want to proceed with.

The following code is needed in the html file.

Load the widgets library https://tilisy.enablebanking.com/lib/widgets.umd.min.js and the default CSS https://tilisy.enablebanking.com/lib/widgets.css on the page where it is going to be used.
<script src="https://tilisy.enablebanking.com/lib/widgets.umd.min.js"></script>
<link href="https://tilisy.enablebanking.com/lib/widgets.css" rel="stylesheet">
Put the custom element enablebanking-aspsp-list registered by the widgets library into the place on the page where the widget needs to be shown.
<enablebanking-aspsp-list
  id="enablebanking-aspsp-list"
  country="FI"
  psu-type="personal"
  service="AIS"
  sandbox></enablebanking-aspsp-list>
Add an event listener, which would trigger authorisation of access to account information or payment initiation.
<script>
  document.getElementById("enablebanking-aspsp-list").addEventListener("selected", function(e) {
    console.log(e.detail)
  });
</script>
When an end-user clicks one of the ASPSP cards, the event selected will be triggered and the detail field value is like this:

{
    "beta": false,
    "country": "SE",
    "name": "Ekeby Sparbank",
    "psuType": "personal",
    "sandbox": true,
    "service": "AIS"
}
The element enablebanking-aspsp-list has the following attributes:

country (required), two-letter country code determining which ASPSPs will be displayed;
psu-type (required), either personal or business determining the type of user, which will grant authorisation;
service (required), either AIS or PIS determining whether account information or payment initiation service will be used;
sandbox (optional), to be provided in case sandbox authorisation will take place in the sandbox environment;
no-beta (optional), can be used to filter out ASPSPs whose integrations are still in the beta-testing phase;
origin (optional), to be provided in case a custom/dedicated environment is used, the default value is https://tilisy.enablebanking.com;
search-term (optional), can be used to filter ASPSPs by name;
logo-transform (optional), can be used change dimentions of the logo image (for example, -/resize/320x/-/crop/440x340/center/, for full list of possible transformations, please refer to https://uploadcare.com/docs/transformations/image/resize-crop/).
The element produces the following events:

error, if an error occurs;
ready, when the widget is fully loaded or them the list of ASPSP is updated;
selected, after a user has selected an ASPSP.
Auth flow
This widget provides the possibility to perform interactions with an end user necessary for authorisation of access to account information and payment initiation from a web page hosted by the application accessing Enable Banking API and, if necessary, redirect directly ASPSPs bypassing redirect to tilisy.enablebanking.com (or a custom domain, in case the dedicated single-tenant environment is used).

In order to use the widget, the following is needed.

Load the widgets library https://tilisy.enablebanking.com/lib/widgets.umd.min.js on the page where it is going to be used.
<script src="https://tilisy.enablebanking.com/lib/widgets.umd.min.js"></script>
Put the custom element enablebanking-auth-flow registered by the widgets library into the place on the page where the widget needs to be shown.
<enablebanking-auth-flow
  id="enablebanking-auth-flow"
  authorization="a8bfe9f4-dfdf-4c86-9a94-9db7660bd4bd"
  locale="SV"
  can-cancel
  sandbox></enablebanking-auth-flow>
The element enablebanking-auth-flow has the following attributes:

authorization (conditional), should contain authorisation ID received from POST /auth API call;
payment (conditional), should contain payment ID received from POST /payment API call;
locale (optional), language in which the widget content should be presented. Supported languages: DA, EN, ET, FI, FR, LT, LV, NL, NO, PL, RU, SV;
sandbox (optional), to be used when authorisation was initiated with an application registered to sandbox environment;
origin (optional), to be provided in case a custom/dedicated environment is used, the default value is https://tilisy.enablebanking.com.
Using event listener function

<script>
  document.getElementById("enablebanking-auth-flow").addEventListener("ready", function(e) {
    console.log("Auth flow widget is loaded")
  });
</script>
The element produces the following events:

error, if an error occurs,
ready, when the widget is fully loaded,
ais-loaded, after authorisation session for AIS service is established,
pis-loaded, after authorisation session for PIS service is established.
The events can be listened similarly to standard Javascript events using addEventListener method called for the enablebanking-auth-flow element.

The widget includes default CSS, which can be overriden.

NB

The widget can be used only on the websites with origins whitelisted for the application used to initiate end user authorisation.

Whitelisting of the origins can be done through the control panel:

Go to https://enablebanking.com/cp/applications (opens new window);
Choose Edit from the context menu for your application ("⋮" next to the application name);
Enter necessary origins into the "Allowed widget origins" edit box;
Press the "Save" button.