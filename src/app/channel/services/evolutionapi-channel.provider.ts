import type { HttpClient } from '@/app/common/interfaces/http-client'
import type { ChannelProvider } from '../interfaces/channel.provider'

export type CreateInstanceEvolutionApiRequest = {
  instanceName: string
  number: string
  qrcode?: boolean
  integration?: 'WHATSAPP-BAILEYS' | 'WHATSAPP-BUSINESS' | 'EVOLUTION'
}

export type CreateInstanceEvolutionApiResponse = {
  instance: EvoApiInstanceType
  qrcode: EvoApiQrCode
}

export type EvoApiInstanceType = {
  accessTokenWaBusiness: string
  instanceId: string
  instanceName: string
  integration: string
  status: string
  webhookWaBusiness: any
}

export type EvoApiQrCode = {
  base64: string
  code: string
  count: number
  pairingCode: any
}

export class EvolutionApiChannelProvider implements ChannelProvider {
  private url = process.env.EVO_API_URL ?? ''
  private token = process.env.EVO_API_TOKEN ?? ''

  constructor(private readonly httpClient: HttpClient) {}

  async connect({
    instanceName,
    number,
    qrcode,
    integration,
  }: CreateInstanceEvolutionApiRequest): Promise<CreateInstanceEvolutionApiResponse> {
    const { data } = await this.httpClient.post<
      CreateInstanceEvolutionApiResponse,
      CreateInstanceEvolutionApiRequest
    >(
      `${this.url}/instance/create`,
      {
        instanceName,
        number,
        qrcode: qrcode ?? true,
        integration: integration ?? 'WHATSAPP-BAILEYS',
      },
      {
        headers: {
          apikey: this.token,
        },
      },
    )

    if (!data.instance) {
      throw new Error('error when create new instance in Evolution API')
    }

    if (!data.qrcode) {
      throw new Error('Evolution API did not return the QR code.')
    }

    return data
  }

  async generateQrCode(instanceName: string) {
    const { data } = await this.httpClient.get<EvoApiQrCode>(
      `${this}/instance/connect/${instanceName}`,
    )

    return data
  }
}
