def double_number():
    number = float(input("הכנס מספר: "))
    result = number * 2
    return result


if __name__ == "__main__":
    result = double_number()
    print(f"התוצאה: {result}")
