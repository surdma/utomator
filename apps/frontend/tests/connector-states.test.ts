import {expect,test} from "@playwright/test";
import {connectorAccount,installConnectorApi,openConnectorDialog,iso} from "./support/connector-mocks";

test("LinkedIn connection moves from disconnected through sign-in to verified and persists",async({page})=>{
  const fixture=await installConnectorApi(page,[
    connectorAccount("linkedin",{id:"li-one",label:"Account owner",status:"disconnected",handle:"account-owner"}),
  ]);
  const dialog=await openConnectorDialog(page);
  await dialog.getByRole("button",{name:"Connect LinkedIn",exact:true}).click();
  await expect(dialog.getByTestId("connector-status")).toHaveText("Sign-in in progress");
  await expect(dialog.getByRole("button",{name:"Verify connection"})).toBeVisible();
  await dialog.getByRole("button",{name:"Verify connection"}).click();
  await expect(dialog.getByTestId("connector-status")).toHaveText("Session connected");
  await expect(dialog.getByText(/LinkedIn session verified/)).toBeVisible();
  expect(fixture.commands.map(command=>command.operation)).toEqual(["connect","sync"]);
  await page.reload();
  await expect((await openConnectorDialog(page)).getByTestId("connector-status")).toHaveText("Session connected");
});

test("An explicit check does not disconnect a valid LinkedIn account",async({page})=>{
  const fixture=await installConnectorApi(page,[
    connectorAccount("linkedin",{id:"li-valid",label:"Saved LinkedIn",status:"connected",verifiedAt:iso.hoursAgo(42)}),
  ]);
  const dialog=await openConnectorDialog(page);
  await dialog.getByRole("button",{name:"Check connection"}).click();
  await expect(dialog.getByTestId("connector-status")).toHaveText("Session connected");
  expect(fixture.commands.at(-1)?.operation).toBe("sync");
});

test("Errors can be retried without pretending that the account was connected",async({page})=>{
  let rejected=false;
  const fixture=await installConnectorApi(page,[
    connectorAccount("linkedin",{id:"li-error",label:"Saved LinkedIn"}),
  ],event=>{
    if(event.operation==="connect"&&!rejected){
      rejected=true;return {status:502,body:{error:"LinkedIn sign-in unavailable"}};
    }
    return undefined;
  });
  const dialog=await openConnectorDialog(page);
  await dialog.getByRole("button",{name:"Connect LinkedIn",exact:true}).click();
  await expect(dialog.getByRole("alert")).toContainText("LinkedIn sign-in unavailable");
  await expect(dialog.getByTestId("connector-status")).toHaveText("Not connected");
  await dialog.getByRole("button",{name:"Connect LinkedIn",exact:true}).click();
  await expect(dialog.getByTestId("connector-status")).toHaveText("Sign-in in progress");
  expect(fixture.commands.filter(c=>c.operation==="connect").length).toBe(2);
});

test("Disconnect is explicitly confirmed and clears the server connection",async({page})=>{
  const fixture=await installConnectorApi(page,[
    connectorAccount("linkedin",{id:"li-ready",label:"Saved LinkedIn",status:"connected",verifiedAt:iso.now()}),
  ]);
  const dialog=await openConnectorDialog(page);
  await dialog.getByRole("button",{name:"Disconnect",exact:true}).click();
  await expect(dialog.getByRole("button",{name:"Confirm disconnect"})).toBeVisible();
  await dialog.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(dialog.getByTestId("connector-status")).toHaveText("Session connected");
  await dialog.getByRole("button",{name:"Disconnect",exact:true}).click();
  await dialog.getByRole("button",{name:"Confirm disconnect"}).click();
  await expect(dialog.getByTestId("connector-status")).toHaveText("Not connected");
  expect(fixture.commands.at(-1)?.operation).toBe("disconnect");
});

test("Compact LinkedIn dialog stays usable on narrow mobile viewports",async({page})=>{
  await page.setViewportSize({width:390,height:750});
  await installConnectorApi(page,[
    connectorAccount("linkedin",{id:"li-mobile",label:"Mobile owner",status:"connected",verifiedAt:iso.now()}),
  ]);
  const dialog=await openConnectorDialog(page);
  await expect(dialog.getByRole("heading",{name:"LinkedIn",exact:true})).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Check connection"})).toBeVisible();
  expect(await dialog.evaluate(element=>element.scrollWidth<=element.clientWidth+1)).toBe(true);
});
