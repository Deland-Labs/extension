import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { DecodedPsbt, Inscription, SignPsbtOptions, ToSignInput } from '@/shared/types';
import { Button, Card, Column, Content, Footer, Header, Icon, Layout, Row, Text, TextArea } from '@/ui/components';
import { useTools } from '@/ui/components/ActionComponent';
import { AddressText } from '@/ui/components/AddressText';
import { Empty } from '@/ui/components/Empty';
import InscriptionPreview from '@/ui/components/InscriptionPreview';
import { TabBar } from '@/ui/components/TabBar';
import { WarningPopover } from '@/ui/components/WarningPopover';
import WebsiteBar from '@/ui/components/WebsiteBar';
import { useAccountAddress, useCurrentAccount } from '@/ui/state/accounts/hooks';
import { colors } from '@/ui/theme/colors';
import { fontSizes } from '@/ui/theme/font';
import { copyToClipboard, satoshisToAmount, useApproval, useWallet } from '@/ui/utils';
import { LoadingOutlined } from '@ant-design/icons';

interface Props {
  header?: React.ReactNode;
  params: {
    data: {
      psbtHexs: string[];
      options: SignPsbtOptions[];
    };
    session?: {
      origin: string;
      icon: string;
      name: string;
    };
  };
  handleCancel?: () => void;
  handleConfirm?: () => void;
}
interface InputInfo {
  txid: string;
  vout: number;
  address: string;
  value: number;
  inscrip;
}

interface OutputInfo {
  address: string;
  value: number;
}

enum TabState {
  DETAILS,
  DATA,
  HEX
}

interface InscriptioinInfo {
  id: string;
  isSent: boolean;
}

function SignTxDetails({ decodedPsbt }: { decodedPsbt: DecodedPsbt }) {
  const inscriptions = useMemo(() => {
    return decodedPsbt.inputInfos.reduce<Inscription[]>((pre, cur) => cur.inscriptions.concat(pre), []);
  }, [decodedPsbt]);

  const address = useAccountAddress();

  const spendSatoshis = useMemo(() => {
    const inValue = decodedPsbt.inputInfos
      .filter((v) => v.address === address)
      .reduce((pre, cur) => cur.value + pre, 0);
    const outValue = decodedPsbt.outputInfos
      .filter((v) => v.address === address)
      .reduce((pre, cur) => cur.value + pre, 0);
    const spend = inValue - outValue;
    return spend;
  }, [decodedPsbt]);

  const spendAmount = useMemo(() => satoshisToAmount(spendSatoshis), [spendSatoshis]);

  const outputValueSaotoshis = useMemo(
    () => inscriptions.reduce((pre, cur) => pre + cur.outputValue, 0),
    [inscriptions]
  );
  const outputValueAmount = useMemo(() => satoshisToAmount(outputValueSaotoshis), [outputValueSaotoshis]);
  return (
    <Column gap="lg">
      <Text text="Sign Transaction" preset="title-bold" textCenter mt="lg" />
      <Row justifyCenter>
        <Card style={{ backgroundColor: '#272626', maxWidth: 320, width: 320 }}>
          <Column gap="lg">
            <Column>
              {inscriptions.length > 0 && (
                <Column justifyCenter>
                  <Text
                    text={
                      inscriptions.length === 1 ? 'Spend Inscription' : `Spend Inscription (${inscriptions.length})`
                    }
                    textCenter
                    color="textDim"
                  />
                  <Row overflowX gap="lg" justifyCenter style={{ width: 280 }} pb="lg">
                    {inscriptions.map((v) => (
                      <InscriptionPreview key={v.inscriptionId} data={v} preset="small" />
                    ))}
                  </Row>
                </Column>
              )}
              {inscriptions.length > 0 && <Row style={{ borderTopWidth: 1, borderColor: colors.border }} my="md" />}

              <Column>
                <Text text={'Spend Amount'} textCenter color="textDim" />

                <Column justifyCenter>
                  <Text text={spendAmount} color="white" preset="bold" textCenter size="xxl" />
                  {outputValueSaotoshis > 0 && (
                    <Text text={`${outputValueAmount} (in inscriptions)`} preset="sub" textCenter />
                  )}
                </Column>
              </Column>
            </Column>
          </Column>
        </Card>
      </Row>
    </Column>
  );
}

function Section({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <Column>
      <Text text={title} preset="bold" />
      <Card>
        <Row full justifyBetween itemsCenter>
          {children}
        </Row>
      </Card>
    </Column>
  );
}

interface TxInfo {
  psbtHexs: string[];
  txError: string;
  decodedPsbts: DecodedPsbt[];
  toSignInputsArray: ToSignInput[][];
  currentIndex: number;
  isScammer: boolean;
}

const initTxInfo: TxInfo = {
  psbtHexs: [],
  txError: '',
  decodedPsbts: [],
  toSignInputsArray: [],
  currentIndex: 0,
  isScammer: false
};

export default function MultiSignPsbt({
  params: {
    data: { psbtHexs, options },
    session
  },
  header,
  handleCancel,
  handleConfirm
}: Props) {
  const [getApproval, resolveApproval, rejectApproval] = useApproval();

  const [txInfo, setTxInfo] = useState<TxInfo>(initTxInfo);

  const [tabState, setTabState] = useState(TabState.DATA);

  const wallet = useWallet();
  const [loading, setLoading] = useState(true);

  const tools = useTools();

  const [isWarningVisible, setIsWarningVisible] = useState(false);

  const init = async () => {
    let txError = '';

    const { isScammer } = await wallet.checkWebsite(session?.origin || '');
    const decodedPsbts: DecodedPsbt[] = [];

    for (let i = 0; i < psbtHexs.length; i++) {
      const psbtHex = psbtHexs[i];
      const decodedPsbt = await wallet.decodePsbt(psbtHex);
      decodedPsbts.push(decodedPsbt);
      if (decodedPsbt.risks.length > 0) {
        setIsWarningVisible(true);
      }
    }

    const toSignInputsArray: ToSignInput[][] = [];
    try {
      for (let i = 0; i < psbtHexs.length; i++) {
        const toSignInputs = await wallet.formatOptionsToSignInputs(psbtHexs[i], options[i]);
        toSignInputsArray.push(toSignInputs);
      }
    } catch (e) {
      txError = (e as Error).message;
      tools.toastError(txError);
    }

    setTxInfo({
      decodedPsbts,
      psbtHexs,
      toSignInputsArray,
      txError,
      currentIndex: 0,
      isScammer
    });

    setLoading(false);
  };

  useEffect(() => {
    init();
  }, []);

  const updateTxInfo = useCallback(
    (params: { currentIndex?: number }) => {
      setTxInfo(Object.assign({}, txInfo, params));
    },
    [txInfo, setTxInfo]
  );

  if (!handleCancel) {
    handleCancel = () => {
      if (txInfo.currentIndex > 0) {
        updateTxInfo({
          currentIndex: txInfo.currentIndex - 1
        });
        return;
      }
      rejectApproval();
    };
  }

  if (!handleConfirm) {
    handleConfirm = () => {
      if (txInfo.currentIndex < txInfo.psbtHexs.length - 1) {
        updateTxInfo({
          currentIndex: txInfo.currentIndex + 1
        });
        return;
      }
      resolveApproval({
        psbtHexs: txInfo.psbtHexs
      });
    };
  }

  const decodedPsbt = useMemo(() => txInfo.decodedPsbts[txInfo.currentIndex], [txInfo]);
  const psbtHex = useMemo(() => txInfo.psbtHexs[txInfo.currentIndex], [txInfo]);
  const toSignInputs = useMemo(() => txInfo.toSignInputsArray[txInfo.currentIndex], [txInfo]);

  const networkFee = useMemo(() => (decodedPsbt ? satoshisToAmount(decodedPsbt.fee) : 0), [decodedPsbt]);
  const currentAccount = useCurrentAccount();
  const detailsComponent = useMemo(() => {
    if (decodedPsbt) {
      return <SignTxDetails decodedPsbt={decodedPsbt} />;
    } else {
      return <Empty />;
    }
  }, [decodedPsbt]);

  const isValidData = useMemo(() => {
    if (psbtHex === '') {
      return false;
    }
    return true;
  }, [psbtHex]);

  const isValid = useMemo(() => {
    if (decodedPsbt && decodedPsbt.inputInfos.length == 0) {
      return false;
    }
    if (!toSignInputs || toSignInputs.length == 0) {
      return false;
    }
    return true;
  }, [decodedPsbt, toSignInputs]);

  if (loading) {
    return (
      <Layout>
        <Content itemsCenter justifyCenter>
          <Icon size={fontSizes.xxxl} color="gold">
            <LoadingOutlined />
          </Icon>
        </Content>
      </Layout>
    );
  }

  if (!decodedPsbt) {
    return <Empty />;
  }

  if (!header && session) {
    header = (
      <Header>
        <WebsiteBar session={session} />
      </Header>
    );
  }

  if (txInfo.isScammer) {
    return (
      <Layout>
        <Content>
          <Column>
            <Text text="Phishing Detection" preset="title-bold" textCenter mt="xxl" />
            <Text text="Malicious behavior and suspicious activity have been detected." mt="md" />
            <Text text="Your access to this page has been restricted by KasWare Wallet as it might be unsafe." mt="md" />
          </Column>
        </Content>

        <Footer>
          <Row full>
            <Button text="Reject (blocked by KasWare Wallet)" preset="danger" onClick={handleCancel} full />
          </Row>
        </Footer>
      </Layout>
    );
  }

  const count = txInfo.psbtHexs.length;
  const arr: { label: string; key: number }[] = [];
  for (let i = 0; i < count; i++) {
    arr.push({
      label: `${i + 1}`,
      key: i
    });
  }
  const tabItems = arr;
  return (
    <Layout>
      {header}
      <Content>
        <Column>
          {detailsComponent}

          <Row mt="lg" mb="lg">
            <TabBar
              defaultActiveKey={TabState.DATA}
              activeKey={TabState.DATA}
              items={[
                // { label: 'DETAILS', key: TabState.DETAILS },
                { label: 'DATA', key: TabState.DATA },
                { label: 'HEX', key: TabState.HEX }
              ]}
              onTabClick={(key) => {
                setTabState(key as any);
              }}
            />
          </Row>

          {tabState === TabState.DATA && isValidData && (
            <Column gap="xl">
              <Column>
                <Text text="INPUTS:" preset="bold" />
                <Card>
                  <Column full justifyCenter>
                    {decodedPsbt.inputInfos.map((v, index) => {
                      const isToSign = toSignInputs && toSignInputs.find((v) => v.index === index) ? true : false;
                      return (
                        <Row
                          key={'output_' + index}
                          style={index === 0 ? {} : { borderColor: colors.border, borderTopWidth: 1, paddingTop: 10 }}
                          justifyBetween>
                          <Column>
                            <Row>
                              <AddressText address={v.address} color={isToSign ? 'white' : 'textDim'} />
                              {isToSign && (
                                <Row style={{ borderWidth: 1, borderColor: 'gold', borderRadius: 5, padding: 2 }}>
                                  <Text text="to sign" color="gold" size="xs" />
                                </Row>
                              )}
                            </Row>
                          </Column>
                          <Row>
                            <Text text={`${satoshisToAmount(v.value)}`} color={isToSign ? 'white' : 'textDim'} />
                            <Text text="BTC" color="textDim" />
                          </Row>
                        </Row>
                      );
                    })}
                  </Column>
                </Card>
              </Column>

              <Column>
                <Text text="OUTPUTS:" preset="bold" />
                <Card>
                  <Column full justifyCenter gap="lg">
                    {decodedPsbt.outputInfos.map((v, index) => {
                      const isMyAddress = v.address == currentAccount.address;
                      return (
                        <Column
                          key={'output_' + index}
                          style={index === 0 ? {} : { borderColor: colors.border, borderTopWidth: 1, paddingTop: 10 }}>
                          <Column>
                            <Row justifyBetween>
                              <AddressText address={v.address} color={isMyAddress ? 'white' : 'textDim'} />
                              <Row>
                                <Text text={`${satoshisToAmount(v.value)}`} color={isMyAddress ? 'white' : 'textDim'} />
                                <Text text="BTC" color="textDim" />
                              </Row>
                            </Row>
                          </Column>
                        </Column>
                      );
                    })}
                  </Column>
                </Card>
              </Column>

              <Section title="NETWORK FEE:">
                <Text text={networkFee} />
                <Text text="BTC" color="textDim" />
              </Section>

              <Section title="NETWORK FEE RATE:">
                <Text text={decodedPsbt.feeRate.toString()} />
                <Text text="sat/vB" color="textDim" />
              </Section>
            </Column>
          )}

          {tabState === TabState.HEX && isValidData && psbtHex && (
            <Column>
              <Text text={`PSBT HEX DATA: ${psbtHex.length / 2} BYTES`} preset="bold" />

              <TextArea text={psbtHex} />
              <Row
                justifyCenter
                onClick={(e) => {
                  copyToClipboard(psbtHex).then(() => {
                    tools.toastSuccess('Copied');
                  });
                }}>
                <Icon icon="copy" color="textDim" />
                <Text text="Copy psbt transaction data" color="textDim" />
              </Row>
            </Column>
          )}
        </Column>
      </Content>

      <Footer>
        <Row mt="lg" mb="lg" justifyCenter>
          <TabBar
            defaultActiveKey={txInfo.currentIndex}
            activeKey={txInfo.currentIndex}
            items={tabItems}
            preset="number-page"
            onTabClick={(key) => {
              updateTxInfo({ currentIndex: key });
            }}
          />
        </Row>

        <Row full>
          <Button
            preset="default"
            text={txInfo.currentIndex === 0 ? 'Reject All' : 'Back'}
            onClick={handleCancel}
            full
          />
          <Button
            preset="primary"
            text={
              txInfo.currentIndex === txInfo.psbtHexs.length - 1
                ? `Sign All (${txInfo.psbtHexs.length} transactions)`
                : 'Next'
            }
            onClick={handleConfirm}
            disabled={isValid == false}
            full
          />
        </Row>
        {isWarningVisible && (
          <WarningPopover
            risks={decodedPsbt.risks}
            onClose={() => {
              setIsWarningVisible(false);
            }}
          />
        )}
      </Footer>
    </Layout>
  );
}
