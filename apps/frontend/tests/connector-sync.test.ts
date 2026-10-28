import {expect,test} from "@playwright/test";
import {connectorAccount,installConnectorApi,openConnectorDialog,iso} from "./support/connector-mocks";

test("Only LinkedIn is shown; account state remains server-owned across reloads",async({page})=>{
  await installConnectorApi(page,[
    connectorAccount("linkedin",{id:"li-owner",label:"Professional account",status:"connected",verifiedAt:iso.now()}),
    connectorAccount("x",{id:"x-hidden",label:"Not enabled"}),
  ]);
  const dialog=await openConnectorDialog(page);
  await expect(dialog.getByTestId("linkedin-connector")).toBeVisible();
  await expect(dialog.getByRole("heading",{name:"LinkedIn",exact:true})).toBeVisible();
  await expect(dialog.getByText("Professional account")).toBeVisible();
  await expect(dialog.getByTestId("connector-status")).toHaveText("Session connected");
  await expect(dialog.getByRole("heading",{name:"X",exact:true})).toHaveCount(0);
  await expect(dialog.getByRole("heading",{name:"Instagram",exact:true})).toHaveCount(0);
  await page.keyboard.press("Escape");await expect(dialog).toBeHidden();
  await page.reload();
  const reopened=await openConnectorDialog(page);
  await expect(reopened.getByTestId("connector-status")).toHaveText("Session connected");
});

test("Account selection is specific to the connected LinkedIn identity",async({page})=>{
  const seed=[
    connectorAccount("linkedin",{id:"li-one",label:"First LinkedIn",handle:"first-owner",
      profileUrl:"https://www.linkedin.com/in/first-owner/",status:"connected",verifiedAt:iso.now()}),
    connectorAccount("linkedin",{id:"li-two",label:"Second LinkedIn",handle:"second-owner",
      profileUrl:"https://www.linkedin.com/in/second-owner/",status:"disconnected"}),
  ];
  await installConnectorApi(page,seed);
  const dialog=await openConnectorDialog(page);
  await expect(dialog.getByRole("combobox",{name:"LinkedIn account"})).toBeVisible();
  await dialog.getByRole("combobox",{name:"LinkedIn account"}).selectOption("li-two");
  await expect(dialog.getByText("@second-owner")).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Connect LinkedIn",exact:true})).toBeVisible();
  await dialog.getByRole("combobox",{name:"LinkedIn account"}).selectOption("li-one");
  await expect(dialog.getByText("@first-owner")).toBeVisible();
  await expect(dialog.getByRole("button",{name:"Check connection"})).toBeVisible();
});
