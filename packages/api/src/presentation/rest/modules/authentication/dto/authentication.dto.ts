export class RegisterDto {
  clientName: string;

  constructor(name: string) {
    this.clientName = name;
  }
}