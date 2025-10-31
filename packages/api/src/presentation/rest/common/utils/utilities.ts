import { ApiProperty } from '@nestjs/swagger';

export class EndPointLink {
    private _hypertextRef: string = '';
    private _method: string = '';
    private _description: string = '';

    @ApiProperty({ description: 'Hypertext reference URL following \'project{projectId}\'' })
    get hypertextRef(): string {
        return this._hypertextRef;
    }

    set hypertextRef(value: string) {
        this._hypertextRef = value;
    }

    @ApiProperty({ description: 'HTTP method', example: 'GET' })
    get method(): string {
        return this._method;
    }

    set method(value: string) {
        this._method = value;
    }

    @ApiProperty({ description: 'Description of the endpoint' })
    get description(): string {
        return this._description;
    }

    set description(value: string) {
        this._description = value;
    }
}
