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

test("Legacy duplicate accounts require deliberate cleanup, not selection for workflows",async({page})=>{
  const seed=[
    connectorAccount("linkedin",{id:"li-one",label:"First LinkedIn",handle:"first-owner",status:"disconnected"}),
    connectorAccount("linkedin",{id:"li-two",label:"Second LinkedIn",handle:"second-owner",status:"disconnected"}),
  ];
  await installConnectorApi(page,seed);
  const dialog=await openConnectorDialog(page);
  await expect(dialog.getByRole("alert")).toContainText("Legacy duplicates detected");
  await expect(dialog.getByRole("combobox",{name:"Legacy linked account"})).toBeVisible();
});



test("disconnected accounts show Connect, never Sync",async({page})=>{
  const fixture=await installConnectorApi(page,[connectorAccount("linkedin",{id:"li-disconnected"})]);
  const dialog=await openConnectorDialog(page);
  await expect(dialog.getByRole("button",{name:"Connect LinkedIn",exact:true})).toBeVisible();
  await expect(dialog.getByRole("button",{name:/Verify connection|Check connection/})).toHaveCount(0);
  expect(fixture.commands).toHaveLength(0);
});
